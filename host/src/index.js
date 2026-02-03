const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const xrpl = require('xrpl');
const express = require('express');
const { createStorage } = require('./storage');
const { buildEnvelope, encodeEnvelope, decodeEnvelope, signEnvelope, verifyEnvelopeSignature } = require('./envelope');
const { loadAttestationEvidence, verifyAttestation } = require('./attestation');
const { solvePow, verifyPow } = require('./pow');
const { createIpfsClient, storePayload, fetchPayload } = require('./ipfs');
const { fetchLatestRelease } = require('./release');
const { runUpdate } = require('./update');
const { maybeAutoUpdate, verifyRuntimeIntegrity } = require('./integrity');

const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function log(config, level, message, err = null) {
  const configured = config?.logging?.level || 'info';
  const current = LOG_LEVELS[configured] ?? LOG_LEVELS.info;
  const target = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  if (target > current) return;
  const prefix = `[${level.toUpperCase()}] `;
  if (err) {
    process.stderr.write(prefix + message + ' ' + err.message + '\n');
  } else {
    process.stderr.write(prefix + message + '\n');
  }
}

function getRegistrationConfig(config) {
  const enabled = config?.registration?.enabled ?? true;
  const address = config?.registration?.address || '';
  const xrp = String(config?.registration?.xrp || '0.1');
  return { enabled, address, xrp };
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config.json at ${CONFIG_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function assertConfig(config) {
  if (!config.network?.xrplWebSocket) throw new Error('config.network.xrplWebSocket required');
  if (!config.storage?.path) throw new Error('config.storage.path required');
  if (!config.bot?.name) throw new Error('config.bot.name required');
  const registration = getRegistrationConfig(config);
  if (registration.enabled) {
    if (!registration.address || registration.address.startsWith('rREPLACE')) {
      throw new Error('config.registration.address required when registration.enabled is true');
    }
    try {
      xrpl.xrpToDrops(registration.xrp);
    } catch (_) {
      throw new Error('config.registration.xrp must be a valid XRP amount');
    }
  }

  const enforceSignatures = config?.security?.enforceSignatures ?? true;
  if (enforceSignatures) {
    const signingKey = config?.security?.signingKeyBase64;
    const publicKeys = config?.security?.publicKeys || {};
    if (!signingKey) {
      throw new Error('config.security.signingKeyBase64 required when security.enforceSignatures is true');
    }
    if (Object.keys(publicKeys).length === 0) {
      throw new Error('config.security.publicKeys required when security.enforceSignatures is true');
    }
  }

  const powEnabled = config?.security?.pow?.enabled ?? true;
  if (powEnabled) {
    const difficulty = Number(config?.security?.pow?.difficulty ?? 0);
    if (!Number.isFinite(difficulty) || difficulty < 0) {
      throw new Error('config.security.pow.difficulty must be a non-negative number');
    }
  }

  const requireSignedRelease = config.release?.requireSignedRelease ?? true;
  if (requireSignedRelease) {
    if (!config.release?.publisherPublicKey || config.release.publisherPublicKey.startsWith('BASE64')) {
      throw new Error('config.release.publisherPublicKey required when release.requireSignedRelease is true');
    }
    if (!config.release?.publisherAddress || config.release.publisherAddress.startsWith('rREPLACE')) {
      throw new Error('config.release.publisherAddress required when release.requireSignedRelease is true');
    }
  }

  const attestationEnabled = config.security?.attestation?.enabled ?? true;
  if (attestationEnabled) {
    if (!config.security?.attestation?.verifyCommand) {
      throw new Error('config.security.attestation.verifyCommand required when attestation.enabled is true');
    }
  }

  const discoveryEnabled = config.discovery?.enabled ?? false;
  if (discoveryEnabled) {
    if (!config.discovery?.registryAddress || config.discovery.registryAddress.startsWith('rREPLACE')) {
      throw new Error('config.discovery.registryAddress required when discovery.enabled is true');
    }
  }
}

async function loadIdentity(config, storage) {
  const existing = storage.readIdentity();
  if (existing && existing.seed) return existing;

  let wallet;
  if (config.bot.seed && config.bot.seed.trim()) {
    wallet = xrpl.Wallet.fromSeed(config.bot.seed.trim());
  } else {
    wallet = xrpl.Wallet.generate();
  }

  const identity = {
    name: config.bot.name,
    address: wallet.address,
    publicKey: wallet.publicKey,
    seed: wallet.seed
  };

  storage.writeIdentity(identity);
  return identity;
}

async function fundWallet(config, address) {
  if (!config.network?.faucetUrl) return;
  const response = await fetch(config.network.faucetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: address })
  });
  return response.json();
}

async function connectClient(config) {
  const client = new xrpl.Client(config.network.xrplWebSocket);
  await client.connect();
  return client;
}

async function getLedgerCurrentIndex(client) {
  const response = await client.request({ command: 'ledger_current' });
  return response.result.ledger_current_index;
}

async function getNextSequence(client, address) {
  const response = await client.request({
    command: 'account_info',
    account: address,
    ledger_index: 'current',
    queue: true
  });
  const accountData = response.result.account_data;
  const queueData = response.result.queue_data;
  if (queueData?.txn_count && Number.isFinite(queueData.highest_sequence)) {
    return queueData.highest_sequence + 1;
  }
  return accountData.Sequence;
}

async function subscribeAccounts(client, accounts) {
  const unique = [...new Set(accounts.filter(Boolean))];
  if (unique.length === 0) return;
  await client.request({ command: 'subscribe', accounts: unique });
}

async function handleListen(config, storage, identity) {
  const client = await connectClient(config);
  const ipfs = await createIpfsClient(config.ipfs);
  const accounts = [identity.address, ...(config.subscriptions?.accounts || [])];
  if (config.discovery?.enabled && config.discovery?.registryAddress) {
    accounts.push(config.discovery.registryAddress);
  }
  await subscribeAccounts(client, accounts);

  const attestationEnabled = config.security?.attestation?.enabled ?? true;
  const attestationCache = new Map();

  const chunkBuffer = new Map();
  const chunkTtlMs = 5 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [chunkId, entry] of chunkBuffer.entries()) {
      if (now - entry.updatedAt > chunkTtlMs) {
        chunkBuffer.delete(chunkId);
      }
    }
  }, 60 * 1000).unref();

  client.on('transaction', async (tx) => {
    try {
      const memo = tx.transaction?.Memos?.[0]?.Memo?.MemoData;
      if (!memo) return;
      let envelope;
      try {
        envelope = decodeEnvelope(memo);
      } catch (err) {
        log(config, 'warn', 'Failed to decode memo envelope.', err);
        return;
      }

      if (attestationEnabled) {
        const now = Date.now();
        const cached = attestationCache.get(envelope.from);
        const maxAgeSeconds = Number(config.security?.attestation?.maxAgeSeconds ?? 0);
        if (cached && (!maxAgeSeconds || now - cached.at <= maxAgeSeconds * 1000)) {
          // ok
        } else if (envelope.type === 'ATTEST' && envelope.attestation) {
          try {
            const claims = verifyAttestation(config, envelope.attestation);
            attestationCache.set(envelope.from, { claims, at: now });
            log(config, 'info', `Attestation accepted for ${envelope.from}.`);
          } catch (err) {
            log(config, 'warn', `Attestation rejected for ${envelope.from}.`, err);
          }
          return;
        } else {
          log(config, 'warn', `Missing attestation for ${envelope.from}.`);
          return;
        }
      }

      if (envelope.type === 'PRESENCE' || envelope.channel === 'system/presence') {
        storage.appendMessage({
          receivedAt: new Date().toISOString(),
          envelope,
          txHash: tx.transaction.hash
        });
        return;
      }

      const powEnabled = config?.security?.pow?.enabled ?? true;
      if (powEnabled) {
        const difficulty = Number(config?.security?.pow?.difficulty ?? 0);
        const salt = config?.security?.pow?.salt || '';
        if (!verifyPow(envelope, difficulty, salt)) {
          log(config, 'warn', `Invalid PoW for envelope from ${envelope.from}.`);
          return;
        }
      }

      const registration = getRegistrationConfig(config);
      if (registration.enabled) {
        const ok = await ensureRegistrationForAddress(config, envelope.from);
        if (!ok) return;
        if (!envelope.registrationHash) return;
        const hashOk = await verifyRegistrationHash(config, envelope.from, envelope.registrationHash);
        if (!hashOk) return;
      }

      const enforceSignatures = config.security?.enforceSignatures ?? true;
      const publicKey = config.security?.publicKeys?.[envelope.from];
      if (envelope.sig || enforceSignatures) {
        if (!publicKey) {
          if (enforceSignatures) return;
          log(config, 'warn', `Missing public key for signature verification (${envelope.from}).`);
        } else if (!verifyEnvelopeSignature(envelope, publicKey)) {
          if (enforceSignatures) return;
          log(config, 'warn', `Invalid signature for envelope from ${envelope.from}.`);
        }
      }

      if (envelope.chunkId) {
        const entry = chunkBuffer.get(envelope.chunkId) || {
          total: Number(envelope.chunkTotal || 0),
          chunks: new Map(),
          updatedAt: Date.now()
        };
        entry.chunks.set(Number(envelope.chunkIndex), envelope.payload || '');
        entry.updatedAt = Date.now();
        chunkBuffer.set(envelope.chunkId, entry);

        if (entry.total > 0 && entry.chunks.size === entry.total) {
          const ordered = [];
          for (let i = 0; i < entry.total; i += 1) {
            ordered.push(entry.chunks.get(i) || '');
          }
          const payload = ordered.join('');
          const merged = { ...envelope, payload, chunkId: null, chunkIndex: null, chunkTotal: null };
          chunkBuffer.delete(envelope.chunkId);
          storage.appendMessage({
            receivedAt: new Date().toISOString(),
            envelope: merged,
            txHash: tx.transaction.hash
          });
          process.stdout.write(`[${merged.type}] ${merged.channel} :: ${merged.from}\n`);
        }
        return;
      }

      if (envelope.payloadRef && ipfs) {
        try {
          const payload = await fetchPayload(ipfs, envelope.payloadRef);
          const merged = { ...envelope, payload };
          storage.appendMessage({
            receivedAt: new Date().toISOString(),
            envelope: merged,
            txHash: tx.transaction.hash
          });
          process.stdout.write(`[${merged.type}] ${merged.channel} :: ${merged.from}\n`);
        } catch (err) {
          log(config, 'warn', `Failed to fetch IPFS payload (${envelope.payloadRef}).`, err);
        }
      } else {
        storage.appendMessage({
          receivedAt: new Date().toISOString(),
          envelope,
          txHash: tx.transaction.hash
        });
        process.stdout.write(`[${envelope.type}] ${envelope.channel} :: ${envelope.from}\n`);
      }
    } catch (err) {
      log(config, 'error', 'Unhandled transaction handler error.', err);
    }
  });

  if (config.discovery?.enabled) {
    const intervalSeconds = Number(config.discovery?.intervalSeconds ?? 30);
    const intervalMs = Math.max(10, intervalSeconds) * 1000;
    sendPresence(config, identity).catch((err) => log(config, 'warn', 'Failed to send presence.', err));
    setInterval(() => {
      sendPresence(config, identity).catch((err) => log(config, 'warn', 'Failed to send presence.', err));
    }, intervalMs).unref();
  }

  if (config.api?.enabled) {
    startApiServer(config, storage, identity, (payload) => sendEnvelope(config, identity, payload));
  }

  process.stdout.write(`Listening as ${identity.name} (${identity.address})\n`);
}

async function sendEnvelope(config, identity, payload) {
  const channelConfig = config.channels?.[payload.channel];
  const destination = channelConfig?.destination || identity.address;
  const memoData = encodeEnvelope(payload);
  const tx = {
    TransactionType: 'Payment',
    Account: identity.address,
    Destination: destination,
    Amount: '1',
    Memos: [
      {
        Memo: {
          MemoType: '4D4F4C54424F54',
          MemoData: memoData
        }
      }
    ]
  };

  const client = await connectClient(config);
  const wallet = xrpl.Wallet.fromSeed(identity.seed);
  let result;
  let signed;
  try {
    // Avoid temREDUNDANT by using the next sequence after queued transactions.
    tx.Sequence = await getNextSequence(client, identity.address);
    const prepared = await client.autofill(tx, { maxLedgerVersionOffset: 200 });
    // Ensure LastLedgerSequence is safely in the future to avoid timing issues.
    const currentLedger = await getLedgerCurrentIndex(client);
    prepared.LastLedgerSequence = Math.max(prepared.LastLedgerSequence || 0, currentLedger + 200);
    log(
      config,
      'debug',
      `Autofill tx: Sequence=${prepared.Sequence} LastLedgerSequence=${prepared.LastLedgerSequence} ledger_current=${currentLedger}`
    );
    signed = wallet.sign(prepared);
    
    // Submit immediately after signing.
    result = await client.submit(signed.tx_blob);
  } finally {
    await client.disconnect();
  }

  const engineResult = result.result?.engine_result || result.result?.meta?.TransactionResult;
  if (engineResult && engineResult !== 'tesSUCCESS') {
    throw new Error(engineResult);
  }

  return signed?.hash || result.result?.tx_json?.hash || result.result?.hash;
}

async function tryStartIpfs(config) {
  if (!config.ipfs?.enabled || !config.ipfs?.apiUrl) return;
  try {
    const res = await fetch(`${config.ipfs.apiUrl}/api/v0/version`, { method: 'POST' });
    if (res.ok) return;
  } catch (_) {}
  log(config, 'warn', 'IPFS API not reachable. Ensure ipfs daemon is running.');
}

function tryGenerateAttestation(config) {
  const evidencePath = config.security?.attestation?.evidencePath;
  if (!evidencePath) return;
  if (fs.existsSync(evidencePath)) return;
  const generator = path.resolve(__dirname, '..', 'tee', 'gramine', 'generate-attestation.sh');
  if (!fs.existsSync(generator)) {
    log(config, 'warn', 'Attestation generator not found.', new Error(generator));
    return;
  }
  const result = spawnSync(generator, [evidencePath], { encoding: 'utf8' });
  if (result.status !== 0) {
    log(config, 'warn', 'Attestation generation failed.', new Error(result.stderr || result.stdout || 'unknown'));
  }
}

async function handleBootstrap(config, storage, identity) {
  await tryStartIpfs(config);
  tryGenerateAttestation(config);

  const attestationEnabled = config.security?.attestation?.enabled ?? true;
  if (attestationEnabled) {
    const evidence = loadAttestationEvidence(config);
    const claims = verifyAttestation(config, evidence);
    const allowedMrenclaves = config.security.attestation.allowedMrenclaves || [];
    const allowedMrsigners = config.security.attestation.allowedMrsigners || [];
    if (claims.mrenclave && !allowedMrenclaves.includes(claims.mrenclave)) {
      allowedMrenclaves.push(claims.mrenclave);
    }
    if (claims.mrsigner && !allowedMrsigners.includes(claims.mrsigner)) {
      allowedMrsigners.push(claims.mrsigner);
    }
    config.security.attestation.allowedMrenclaves = allowedMrenclaves;
    config.security.attestation.allowedMrsigners = allowedMrsigners;
    saveConfig(config);
  }

  const registered = await ensureRegistration(config, identity);
  if (!registered) {
    await handleRegister(config, storage, identity);
  }
  await handleAttest(config, storage, identity);
  return handleListen(config, storage, identity);
}

async function handlePost(config, storage, identity) {
  const args = process.argv.slice(3);
  const channel = args[0];
  const type = args[1] || 'PUBLIC';
  const payload = args.slice(2).join(' ');

  if (!channel || !payload) {
    throw new Error('Usage: npm run post -- <channel-id> <type> <payload>');
  }

  const canSend = await ensureRegistration(config, identity);
  if (!canSend) {
    throw new Error('Registration required before sending. Run: npm run register');
  }

  const registrationHash = await getRegistrationHash(config, identity.address);
  const envelopes = await buildEnvelopes(config, identity, channel, type, payload, registrationHash);
  for (const envelope of envelopes) {
    const hash = await sendEnvelope(config, identity, envelope);
    storage.appendMessage({
      sentAt: new Date().toISOString(),
      envelope,
      txHash: hash
    });
    process.stdout.write(`Posted to ${channel} (${hash})\n`);
  }
}

async function handleComment(config, storage, identity) {
  const args = process.argv.slice(3);
  const channel = args[0];
  const targetHash = args[1];
  const payload = args.slice(2).join(' ');

  if (!channel || !targetHash || !payload) {
    throw new Error('Usage: npm run comment -- <channel-id> <targetHash> <payload>');
  }

  const canSend = await ensureRegistration(config, identity);
  if (!canSend) {
    throw new Error('Registration required before sending. Run: npm run register');
  }

  const registrationHash = await getRegistrationHash(config, identity.address);
  const envelopes = await buildEnvelopes(
    config,
    identity,
    channel,
    'COMMENT',
    payload,
    registrationHash,
    { replyTo: targetHash }
  );
  for (const envelope of envelopes) {
    const hash = await sendEnvelope(config, identity, envelope);
    storage.appendMessage({
      sentAt: new Date().toISOString(),
      envelope,
      txHash: hash
    });
    process.stdout.write(`Commented on ${targetHash} (${hash})\n`);
  }
}

async function handleLike(config, storage, identity) {
  const args = process.argv.slice(3);
  const channel = args[0];
  const targetHash = args[1];

  if (!channel || !targetHash) {
    throw new Error('Usage: npm run like -- <channel-id> <targetHash>');
  }

  const canSend = await ensureRegistration(config, identity);
  if (!canSend) {
    throw new Error('Registration required before sending. Run: npm run register');
  }

  const registrationHash = await getRegistrationHash(config, identity.address);
  const envelopes = await buildEnvelopes(
    config,
    identity,
    channel,
    'LIKE',
    '',
    registrationHash,
    { targetHash, reaction: 'like' }
  );
  for (const envelope of envelopes) {
    const hash = await sendEnvelope(config, identity, envelope);
    storage.appendMessage({
      sentAt: new Date().toISOString(),
      envelope,
      txHash: hash
    });
    process.stdout.write(`Liked ${targetHash} (${hash})\n`);
  }
}

async function handleUpvote(config, storage, identity) {
  const args = process.argv.slice(3);
  const channel = args[0];
  const targetHash = args[1];

  if (!channel || !targetHash) {
    throw new Error('Usage: npm run upvote -- <channel-id> <targetHash>');
  }

  const canSend = await ensureRegistration(config, identity);
  if (!canSend) {
    throw new Error('Registration required before sending. Run: npm run register');
  }

  const registrationHash = await getRegistrationHash(config, identity.address);
  const envelopes = await buildEnvelopes(
    config,
    identity,
    channel,
    'UPVOTE',
    '',
    registrationHash,
    { targetHash, reaction: 'upvote', vote: 1 }
  );
  for (const envelope of envelopes) {
    const hash = await sendEnvelope(config, identity, envelope);
    storage.appendMessage({
      sentAt: new Date().toISOString(),
      envelope,
      txHash: hash
    });
    process.stdout.write(`Upvoted ${targetHash} (${hash})\n`);
  }
}

async function handleAttest(config, storage, identity) {
  const attestationEnabled = config.security?.attestation?.enabled ?? true;
  if (!attestationEnabled) {
    process.stdout.write('Attestation is disabled in config.\n');
    return;
  }
  const evidence = loadAttestationEvidence(config);
  if (!evidence) {
    throw new Error('Missing attestation evidence (security.attestation.evidencePath)');
  }
  const registrationHash = await getRegistrationHash(config, identity.address);
  const envelope = buildEnvelope({
    type: 'ATTEST',
    from: identity.address,
    channel: 'system/attest',
    payload: '',
    registrationHash,
    attestation: evidence
  });
  const withPow = applyEnvelopePow(config, envelope);
  const signed = applyEnvelopeSignature(config, withPow);
  const hash = await sendEnvelope(config, identity, signed);
  storage.appendMessage({
    sentAt: new Date().toISOString(),
    envelope: signed,
    txHash: hash
  });
  process.stdout.write(`Attestation sent (${hash}).\n`);
}

async function sendPresence(config, identity) {
  if (!config.discovery?.enabled || !config.discovery?.registryAddress) return;
  const registrationHash = await getRegistrationHash(config, identity.address);
  const payload = JSON.stringify({
    name: identity.name || '',
    apiBase: config.api?.publicBase || config.api?.host ? `http://${config.api.host || '127.0.0.1'}:${config.api?.port || 8787}` : ''
  });
  const envelope = buildEnvelope({
    type: 'PRESENCE',
    from: identity.address,
    channel: 'system/presence',
    payload,
    registrationHash
  });
  const withPow = applyEnvelopePow(config, envelope);
  const signed = applyEnvelopeSignature(config, withPow);
  await sendEnvelope(config, identity, signed);
}

async function handleInit(config, storage, identity) {
  process.stdout.write(`Initialized ${identity.name} (${identity.address})\n`);
  if (config.bot.autoFund) {
    await fundWallet(config, identity.address);
    process.stdout.write('Faucet funding requested.\n');
  }
}

async function handleRegister(config, storage, identity) {
  const registration = getRegistrationConfig(config);
  if (!registration.enabled) {
    process.stdout.write('Registration is disabled in config.\n');
    return;
  }

  const alreadyRegistered = await ensureRegistration(config, identity);
  if (alreadyRegistered) {
    process.stdout.write('Already registered; skipping registration payment.\n');
    return;
  }

  process.stdout.write(`Connecting to XRPL testnet...\n`);
  const tx = {
    TransactionType: 'Payment',
    Account: identity.address,
    Destination: registration.address,
    Amount: xrpl.xrpToDrops(registration.xrp)
  };

  const client = await connectClient(config);
  process.stdout.write(`Connected. Preparing transaction...\n`);
  const wallet = xrpl.Wallet.fromSeed(identity.seed);
  let result;
  let signed;
  try {
    // Use getNextSequence to avoid sequence conflicts with pending transactions
    tx.Sequence = await getNextSequence(client, identity.address);
    const prepared = await client.autofill(tx, { maxLedgerVersionOffset: 200 });
    // Add buffer to LastLedgerSequence to avoid timing issues.
    const currentLedger = await getLedgerCurrentIndex(client);
    prepared.LastLedgerSequence = Math.max(prepared.LastLedgerSequence || 0, currentLedger + 200);
    process.stdout.write(`Submitting transaction (sequence ${prepared.Sequence}, ledger ${currentLedger})...\n`);
    log(
      config,
      'debug',
      `Autofill registration: Sequence=${prepared.Sequence} LastLedgerSequence=${prepared.LastLedgerSequence} ledger_current=${currentLedger}`
    );
    signed = wallet.sign(prepared);
    result = await client.submit(signed.tx_blob);
  } finally {
    await client.disconnect();
  }

  const engineResult = result.result?.engine_result || result.result?.meta?.TransactionResult;
  if (engineResult && engineResult !== 'tesSUCCESS') {
    if (engineResult === 'temREDUNDANT') {
      const nowRegistered = await ensureRegistration(config, identity);
      if (nowRegistered) {
        process.stdout.write('Registration already exists; treating as success.\n');
        return;
      }
    }
    throw new Error(engineResult);
  }

  const hash = signed?.hash || result.result?.tx_json?.hash || result.result?.hash;
  storage.appendMessage({
    sentAt: new Date().toISOString(),
    envelope: { type: 'REGISTER', from: identity.address, channel: 'registration', payload: registration.xrp, registrationHash: hash },
    txHash: hash
  });

  process.stdout.write(`Registration payment sent (${hash}).\n`);
}

async function ensureRegistration(config, identity) {
  const registration = getRegistrationConfig(config);
  if (!registration.enabled) return true;
  if (!identity?.address) return false;
  const match = await findRegistrationPayment(config, identity.address);
  return !!match;
}

async function ensureRegistrationForAddress(config, address) {
  const registration = getRegistrationConfig(config);
  if (!registration.enabled) return true;
  if (!address) return false;
  const match = await findRegistrationPayment(config, address);
  return !!match;
}

async function verifyRegistrationHash(config, address, hash) {
  const registration = getRegistrationConfig(config);
  if (!registration.enabled) return false;
  if (!address || !hash) return false;
  const client = await connectClient(config);
  try {
    const response = await client.request({ command: 'tx', transaction: hash });
    const tx = response.result || {};
    if (tx.TransactionType !== 'Payment') return false;
    if (tx.Account !== address) return false;
    if (tx.Destination !== registration.address) return false;
    if (tx.Amount !== xrpl.xrpToDrops(registration.xrp)) return false;
    return true;
  } finally {
    await client.disconnect();
  }
}

async function getRegistrationHash(config, address) {
  const registration = getRegistrationConfig(config);
  if (!registration.enabled) return null;
  if (!address) return null;

  const match = await findRegistrationPayment(config, address);
  return match?.tx?.hash || match?.transaction?.hash || null;
}

async function buildEnvelopes(config, identity, channel, type, payload, registrationHash = null, extraFields = null) {
  let payloadRef = null;
  let finalPayload = payload;
  const minBytes = config.ipfs?.minBytes || 0;
  if (config.ipfs?.enabled && Buffer.byteLength(payload, 'utf8') >= minBytes) {
    const ipfs = await createIpfsClient(config.ipfs);
    payloadRef = await storePayload(ipfs, payload);
    finalPayload = '';
  }

  if (!payloadRef) {
    const maxBytes = config.network?.maxPayloadBytes || 900;
    const baseEnvelope = buildEnvelope({
      type,
      from: identity.address,
      channel,
      payload: '',
      registrationHash,
      ...(extraFields || {})
    });
    const overheadBytes = Buffer.byteLength(JSON.stringify(baseEnvelope), 'utf8');
    const maxPayloadBytes = Math.max(1, maxBytes - overheadBytes);

    if (Buffer.byteLength(finalPayload, 'utf8') > maxPayloadBytes) {
      const chunkId = `${identity.address}-${Date.now()}`;
      const chunks = splitPayload(finalPayload, maxPayloadBytes);
      return chunks.map((chunk, index) => {
        const envelope = buildEnvelope({
          type,
          from: identity.address,
          channel,
          payload: chunk,
          payloadRef: null,
          registrationHash,
          chunkId,
          chunkIndex: index,
          chunkTotal: chunks.length,
          ...(extraFields || {})
        });
        const withPow = applyEnvelopePow(config, envelope);
        return applyEnvelopeSignature(config, withPow);
      });
    }
  }

  return [
    applyEnvelopeSignature(
      config,
      applyEnvelopePow(
        config,
        buildEnvelope({
        type,
        from: identity.address,
        channel,
        payload: finalPayload,
        payloadRef,
        registrationHash,
        ...(extraFields || {})
        })
      )
    )
  ];
}

function splitPayload(payload, maxBytes) {
  const bytes = Buffer.from(payload, 'utf8');
  const chunks = [];
  for (let i = 0; i < bytes.length; i += maxBytes) {
    chunks.push(bytes.slice(i, i + maxBytes).toString('utf8'));
  }
  return chunks;
}

function applyEnvelopeSignature(config, envelope) {
  const signingKey = config.security?.signingKeyBase64;
  if (!signingKey) return envelope;
  const sig = signEnvelope(envelope, signingKey);
  if (!sig) return envelope;
  return { ...envelope, sig };
}

function applyEnvelopePow(config, envelope) {
  const powEnabled = config?.security?.pow?.enabled ?? true;
  if (!powEnabled) return envelope;
  const difficulty = Number(config?.security?.pow?.difficulty ?? 0);
  const salt = config?.security?.pow?.salt || '';
  if (difficulty <= 0) return envelope;
  const solved = solvePow(envelope, difficulty, salt);
  return solved.envelope;
}

async function findRegistrationPayment(config, address) {
  const registration = getRegistrationConfig(config);
  const client = await connectClient(config);
  try {
    const response = await client.request({
      command: 'account_tx',
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      limit: 200
    });

    const requiredDrops = xrpl.xrpToDrops(registration.xrp);
    const match = (response.result.transactions || []).find((tx) => {
      const t = tx.tx || tx.transaction || {};
      if (t.TransactionType !== 'Payment') return false;
      if (t.Destination !== registration.address) return false;
      if (t.Account !== address) return false;
      return t.Amount === requiredDrops;
    });

    return match || null;
  } finally {
    await client.disconnect();
  }
}

function startApiServer(config, storage, identity, sender) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/public', express.static(path.resolve(__dirname, '..', 'public')));

  app.get('/health', (_, res) => res.json({ ok: true }));
  app.get('/identity', (_, res) => res.json({ name: identity.name, address: identity.address, publicKey: identity.publicKey }));
  app.get('/attestation/status', (_, res) => {
    const enabled = config.security?.attestation?.enabled ?? true;
    return res.json({ ok: true, enabled });
  });
  app.get('/messages', (req, res) => {
    const channel = req.query.channel;
    const messages = storage.readMessages();
    if (!channel) return res.json(messages);
    return res.json(messages.filter((msg) => msg.envelope?.channel === channel));
  });

  app.get('/bots', (_, res) => {
    const latest = new Map();
    for (const msg of storage.readMessages()) {
      const env = msg.envelope || {};
      if (env.type !== 'PRESENCE' && env.channel !== 'system/presence') continue;
      const seenAt = msg.receivedAt || msg.sentAt || null;
      if (!env.from) continue;
      let meta = { name: '', apiBase: '' };
      if (typeof env.payload === 'string' && env.payload.trim().startsWith('{')) {
        try { meta = { ...meta, ...JSON.parse(env.payload) }; } catch (_) {}
      } else if (typeof env.payload === 'string') {
        meta.name = env.payload;
      }
      const existing = latest.get(env.from);
      if (!existing || (seenAt && existing.lastSeen < seenAt)) {
        latest.set(env.from, { address: env.from, name: meta.name || '', apiBase: meta.apiBase || '', lastSeen: seenAt });
      }
    }
    return res.json(Array.from(latest.values()));
  });

  app.get('/threads', (req, res) => {
    const channel = req.query.channel;
    const messages = storage.readMessages();
    const roots = new Map();
    const replies = new Map();
    const reactions = new Map();

    for (const msg of messages) {
      const env = msg.envelope || {};
      if (channel && env.channel !== channel) continue;
      const hash = msg.txHash;
      if (!hash) continue;

      if (env.type === 'COMMENT' && env.replyTo) {
        const list = replies.get(env.replyTo) || [];
        list.push({ ...msg, txHash: hash });
        replies.set(env.replyTo, list);
        continue;
      }

      if ((env.type === 'LIKE' || env.type === 'UPVOTE') && env.targetHash) {
        const stat = reactions.get(env.targetHash) || { likes: 0, upvotes: 0 };
        if (env.type === 'LIKE' || env.reaction === 'like') stat.likes += 1;
        if (env.type === 'UPVOTE' || env.reaction === 'upvote') stat.upvotes += 1;
        reactions.set(env.targetHash, stat);
        continue;
      }

      if (!env.replyTo && !env.targetHash) {
        roots.set(hash, { ...msg, txHash: hash });
      }
    }

    const result = Array.from(roots.values()).map((root) => {
      const threadReplies = replies.get(root.txHash) || [];
      const stat = reactions.get(root.txHash) || { likes: 0, upvotes: 0 };
      return { root, replies: threadReplies, reactions: stat };
    });
    return res.json(result);
  });

  app.post('/send', async (req, res) => {
    try {
      const allowSend = config.api?.allowSend ?? false;
      if (!allowSend) {
        return res.status(403).json({ error: 'Send disabled on host API', code: 'SEND_DISABLED' });
      }
      const { channel, type = 'PUBLIC', payload = '' } = req.body || {};
      if (!channel || !payload) {
        return res.status(400).json({ error: 'channel and payload required', code: 'INVALID_REQUEST' });
      }
      const canSend = await ensureRegistration(config, identity);
      if (!canSend) return res.status(403).json({ error: 'Registration required before sending.', code: 'REGISTRATION_REQUIRED' });
      const registrationHash = await getRegistrationHash(config, identity.address);
      const envelopes = await buildEnvelopes(config, identity, channel, type, payload, registrationHash);
      const hashes = [];
      for (const envelope of envelopes) {
        const hash = await sender(envelope);
        storage.appendMessage({
          sentAt: new Date().toISOString(),
          envelope,
          txHash: hash
        });
        hashes.push(hash);
      }
      return res.json({ ok: true, hashes, envelopeCount: envelopes.length });
    } catch (err) {
      return res.status(500).json({ error: err.message, code: 'SEND_FAILED' });
    }
  });

  app.get('/release/latest', async (_, res) => {
    try {
      const release = await fetchLatestRelease(config);
      return res.json({ ok: true, release });
    } catch (err) {
      return res.status(500).json({ error: err.message, code: 'RELEASE_FETCH_FAILED' });
    }
  });

  app.post('/release/download', async (_, res) => {
    try {
      const result = await runUpdate(config, { silent: true });
      return res.json({ ok: true, ...result });
    } catch (err) {
      return res.status(500).json({ error: err.message, code: 'RELEASE_DOWNLOAD_FAILED' });
    }
  });

  const host = config.api?.host || '127.0.0.1';
  const port = config.api?.port || 8787;
  app.listen(port, host, () => {
    process.stdout.write(`API listening on http://${host}:${port}\n`);
  });
}

async function main() {
  const config = loadConfig();
  assertConfig(config);
  await maybeAutoUpdate(config);
  await verifyRuntimeIntegrity(config);
  const storage = createStorage(config.storage.path);
  const identity = await loadIdentity(config, storage);
  const command = process.argv[2] || 'listen';

  if (command === 'init') return handleInit(config, storage, identity);
  if (command === 'register') return handleRegister(config, storage, identity);
  if (command === 'attest') return handleAttest(config, storage, identity);
  if (command === 'bootstrap') return handleBootstrap(config, storage, identity);
  if (command === 'post') return handlePost(config, storage, identity);
  if (command === 'comment') return handleComment(config, storage, identity);
  if (command === 'like') return handleLike(config, storage, identity);
  if (command === 'upvote') return handleUpvote(config, storage, identity);
  if (command === 'listen') return handleListen(config, storage, identity);
  if (command === 'update') return runUpdate(config);

  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  process.stderr.write(err.message + '\n');
  process.exit(1);
});
