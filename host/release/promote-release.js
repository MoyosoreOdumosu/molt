const fs = require('fs');
const path = require('path');

function main() {
  const pendingPath = process.argv[2] || path.resolve(process.cwd(), 'releases', 'pending.json');
  const latestPath = process.argv[3] || path.resolve(process.cwd(), 'releases', 'latest.json');

  if (!fs.existsSync(pendingPath)) {
    process.stderr.write(`Pending manifest not found at ${pendingPath}\n`);
    process.exit(1);
  }

  fs.copyFileSync(pendingPath, latestPath);
  process.stdout.write(`Promoted ${pendingPath} to ${latestPath}\n`);
}

main();
