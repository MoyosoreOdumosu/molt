const fs = require('fs');
const path = require('path');
const nacl = require('tweetnacl');
const { canonicalizeRelease } = require('../src/release');

function signRelease(release, signingKeyBase64) {
  const message = Buffer.from(canonicalizeRelease(release), 'utf8');
  const secretKey = Buffer.from(signingKeyBase64, 'base64');
  const sig = nacl.sign.detached(message, secretKey);
  return Buffer.from(sig).toString('base64');
}

function main() {
  const inputPath = process.argv[2] || 'release.json';
  const signingKeyBase64 = process.env.RELEASE_SIGNING_KEY_BASE64;
  if (!signingKeyBase64) {
    process.stderr.write('Set RELEASE_SIGNING_KEY_BASE64 to sign the release.\n');
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolved)) {
    process.stderr.write(`Release JSON not found at ${resolved}\n`);
    process.exit(1);
  }

  const release = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  release.sig = signRelease(release, signingKeyBase64);

  const outPath = path.resolve(process.cwd(), 'release.signed.json');
  fs.writeFileSync(outPath, JSON.stringify(release, null, 2));
  process.stdout.write(`Signed release written to ${outPath}\n`);
}

main();
