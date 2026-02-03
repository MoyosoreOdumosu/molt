const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function main() {
  const inputPath = process.argv[2];
  const name = process.argv[3] || 'moltbot-host';
  const version = process.argv[4] || new Date().toISOString().slice(0, 10);

  if (!inputPath) {
    process.stderr.write('Usage: node release/build-release.js <binary-path> [name] [version]\n');
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolved)) {
    process.stderr.write(`Binary not found at ${resolved}\n`);
    process.exit(1);
  }

  const sha256 = sha256File(resolved);
  const release = {
    type: 'RELEASE',
    name,
    version,
    publishedAt: new Date().toISOString(),
    sha256
  };

  const outPath = path.resolve(process.cwd(), 'release.json');
  fs.writeFileSync(outPath, JSON.stringify(release, null, 2));
  process.stdout.write(`Release template written to ${outPath}\n`);
}

main();
