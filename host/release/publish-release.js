const fs = require('fs');
const path = require('path');
const xrpl = require('xrpl');
const { encodeEnvelope } = require('../src/envelope');

async function main() {
  const signedPath = process.argv[2] || 'release.signed.json';
  const configPath = process.argv[3] || 'config.json';

  if (!fs.existsSync(signedPath)) {
    process.stderr.write(`Signed release not found at ${signedPath}\n`);
    process.exit(1);
  }
  if (!fs.existsSync(configPath)) {
    process.stderr.write(`Config not found at ${configPath}\n`);
    process.exit(1);
  }

  const release = JSON.parse(fs.readFileSync(path.resolve(signedPath), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'));
  const publisherSeed = process.env.RELEASE_PUBLISHER_SEED;

  if (!publisherSeed) {
    process.stderr.write('Set RELEASE_PUBLISHER_SEED to publish the release.\n');
    process.exit(1);
  }

  const memoTypeHex = (config.release?.memoTypeHex || '').toUpperCase();
  const memoData = encodeEnvelope(release);

  const tx = {
    TransactionType: 'Payment',
    Account: xrpl.Wallet.fromSeed(publisherSeed).address,
    Destination: xrpl.Wallet.fromSeed(publisherSeed).address,
    Amount: '1',
    Memos: [
      {
        Memo: {
          MemoType: memoTypeHex || '4D4F4C5452454C45415345',
          MemoData: memoData
        }
      }
    ]
  };

  const client = new xrpl.Client(config.network.xrplWebSocket);
  await client.connect();
  const wallet = xrpl.Wallet.fromSeed(publisherSeed);
  const prepared = await client.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await client.submit(signed.tx_blob);
  await client.disconnect();

  process.stdout.write(JSON.stringify(result.result, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(err.message + '\n');
  process.exit(1);
});
