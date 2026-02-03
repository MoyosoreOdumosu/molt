const fs = require('fs');
const path = require('path');

function main() {
  const uiCid = process.argv[2];
  if (!uiCid) {
    process.stderr.write('Usage: node release/build-ui-release.js <uiCid>\n');
    process.exit(1);
  }
  const releasePath = path.resolve(process.cwd(), 'release.json');
  if (!fs.existsSync(releasePath)) {
    process.stderr.write('release.json not found. Run build-release.js first.\n');
    process.exit(1);
  }
  const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
  release.uiCid = uiCid;
  fs.writeFileSync(releasePath, JSON.stringify(release, null, 2));
  process.stdout.write(`Added uiCid to ${releasePath}\n`);
}

main();
