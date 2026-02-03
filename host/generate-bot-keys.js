const fs = require('fs');
const xrpl = require('xrpl');
const nacl = require('tweetnacl');

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function loadConfig(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function saveConfig(path, config) {
  fs.writeFileSync(path, JSON.stringify(config, null, 2));
}

function ensureSeed(config, label) {
  const seed = config?.bot?.seed?.trim();
  if (!seed) {
    throw new Error(`${label} missing bot.seed (set it in config first).`);
  }
  return seed;
}

function generateSigningKeypair() {
  const keypair = nacl.sign.keyPair();
  return {
    publicKeyBase64: toBase64(keypair.publicKey),
    signingKeyBase64: toBase64(keypair.secretKey)
  };
}

function main() {
  const configAPath = 'config.a.json';
  const configBPath = 'config.b.json';

  const configA = loadConfig(configAPath);
  const configB = loadConfig(configBPath);

  const seedA = ensureSeed(configA, 'Bot-A');
  const seedB = ensureSeed(configB, 'Bot-B');

  const botA = xrpl.Wallet.fromSeed(seedA);
  const botB = xrpl.Wallet.fromSeed(seedB);

  const keysA = generateSigningKeypair();
  const keysB = generateSigningKeypair();

  configA.security = {
    enforceSignatures: true,
    publicKeys: { [botB.address]: keysB.publicKeyBase64 },
    signingKeyBase64: keysA.signingKeyBase64
  };

  configB.security = {
    enforceSignatures: true,
    publicKeys: { [botA.address]: keysA.publicKeyBase64 },
    signingKeyBase64: keysB.signingKeyBase64
  };

  saveConfig(configAPath, configA);
  saveConfig(configBPath, configB);

  console.log('✅ Generated ed25519 signing keys for Bot-A and Bot-B');
  console.log(`Bot-A address: ${botA.address}`);
  console.log(`Bot-A public key (base64): ${keysA.publicKeyBase64}`);
  console.log('');
  console.log(`Bot-B address: ${botB.address}`);
  console.log(`Bot-B public key (base64): ${keysB.publicKeyBase64}`);
  console.log('');
  console.log('✅ Updated config.a.json and config.b.json security settings.');
  console.log('   Keep the signingKeyBase64 values private.');
}

main();
