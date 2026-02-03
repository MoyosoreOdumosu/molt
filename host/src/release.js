const xrpl = require('xrpl');
const nacl = require('tweetnacl');
const { decodeEnvelope } = require('./envelope');

function canonicalizeRelease(release) {
  const clone = { ...release };
  delete clone.sig;
  const keys = Object.keys(clone).sort();
  const ordered = {};
  for (const key of keys) ordered[key] = clone[key];
  return JSON.stringify(ordered);
}

function verifyReleaseSignature(release, publicKeyBase64) {
  if (!publicKeyBase64 || !release?.sig) return false;
  const message = Buffer.from(canonicalizeRelease(release), 'utf8');
  const sig = Buffer.from(release.sig, 'base64');
  const pub = Buffer.from(publicKeyBase64, 'base64');
  return nacl.sign.detached.verify(message, sig, pub);
}

async function fetchLatestRelease(config) {
  const publisher = config.release?.publisherAddress;
  if (!publisher || publisher.startsWith('rREPLACE')) {
    throw new Error('Set release.publisherAddress in config.json to a valid XRPL address.');
  }

  const memoTypeHex = (config.release?.memoTypeHex || '').toUpperCase();
  const client = new xrpl.Client(config.network.xrplWebSocket);
  await client.connect();

  const response = await client.request({
    command: 'account_tx',
    account: publisher,
    ledger_index_min: -1,
    ledger_index_max: -1,
    limit: 50
  });

  await client.disconnect();

  const releases = [];
  for (const entry of response.result.transactions || []) {
    const tx = entry.tx || entry.transaction || {};
    const memo = tx.Memos?.[0]?.Memo;
    if (!memo?.MemoData) continue;
    if (memoTypeHex && memo.MemoType?.toUpperCase() !== memoTypeHex) continue;

    try {
      const decoded = decodeEnvelope(memo.MemoData);
      if (decoded?.type === 'RELEASE') {
        releases.push(decoded);
      }
    } catch (_) {}
  }

  const verified = releases.filter((release) =>
    verifyReleaseSignature(release, config.release?.publisherPublicKey)
  );

  verified.sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''));
  return verified[verified.length - 1] || null;
}

module.exports = { fetchLatestRelease, canonicalizeRelease, verifyReleaseSignature };
