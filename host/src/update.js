const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchLatestRelease } = require('./release');
const { pinCid } = require('./pin');

const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config.json at ${CONFIG_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

async function runUpdate(config = null, opts = {}) {
  const cfg = config || loadConfig();
  const silent = !!opts.silent;
  const logger = opts.logger || {
    info: (msg) => {
      if (!silent) process.stdout.write(msg + '\n');
    },
    error: (msg) => {
      if (!silent) process.stderr.write(msg + '\n');
    }
  };

  const release = await fetchLatestRelease(cfg);
  if (!release) {
    logger.info('No releases found.');
    return { release: null };
  }

  logger.info('Latest release:');
  logger.info(JSON.stringify(release, null, 2));
  logger.info('\nCID (fetch from IPFS): ' + (release.cid || 'n/a'));

  if (!release.cid || !release.sha256) return { release, outputPath: null };

  const gateway = cfg.release?.gateway || 'https://ipfs.io/ipfs';
  const url = `${gateway.replace(/\/$/, '')}/${release.cid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download CID from gateway (${res.status})`);
  }

  const data = Buffer.from(await res.arrayBuffer());
  const digest = crypto.createHash('sha256').update(data).digest('hex');
  if (digest !== release.sha256) {
    throw new Error('SHA256 mismatch for release artifact.');
  }

  const outDir = path.resolve(__dirname, '..', 'releases');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${release.name || 'moltbot-host'}-${release.version || release.cid}.bin`);
  fs.writeFileSync(outFile, data);
  logger.info(`\nDownloaded and verified release to ${outFile}`);
  if (release.uiCid && cfg.release?.pinUiOnUpdate) {
    try {
      await pinCid(cfg, release.uiCid);
      logger.info(`Pinned public UI CID: ${release.uiCid}`);
    } catch (err) {
      logger.error(`Failed to pin UI CID: ${err.message}`);
    }
  }
  if (opts.writeManifestPath) {
    fs.writeFileSync(opts.writeManifestPath, JSON.stringify(release, null, 2));
    logger.info(`Release manifest written to ${opts.writeManifestPath}`);
  }
  return { release, outputPath: outFile };
}

if (require.main === module) {
  runUpdate().catch((err) => {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  });
}

module.exports = { runUpdate };
