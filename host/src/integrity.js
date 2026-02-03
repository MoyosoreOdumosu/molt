const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchLatestRelease, verifyReleaseSignature } = require('./release');
const { runUpdate } = require('./update');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function resolveManifestPath(config, key, fallback) {
  const cfgPath = config.release?.[key];
  if (cfgPath) return path.resolve(__dirname, '..', cfgPath);
  return path.resolve(__dirname, '..', 'releases', fallback);
}

function loadReleaseManifest(config) {
  const manifestPath = resolveManifestPath(config, 'manifestPath', 'latest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing release manifest at ${manifestPath}`);
  }
  const release = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return { manifestPath, release };
}

function verifyReleaseObject(config, release) {
  const pubKey = config.release?.publisherPublicKey;
  if (!pubKey) {
    throw new Error('config.release.publisherPublicKey required for release verification');
  }
  if (!verifyReleaseSignature(release, pubKey)) {
    throw new Error('Release signature verification failed');
  }
  if (!release.sha256) {
    throw new Error('Release missing sha256');
  }
}

async function maybeAutoUpdate(config, logger = console) {
  const autoUpdate = config.release?.autoUpdate ?? true;
  if (!autoUpdate) return null;

  let latest;
  try {
    latest = await fetchLatestRelease(config);
  } catch (err) {
    logger.error(`Auto-update check failed: ${err.message}`);
    return null;
  }

  if (!latest) return null;
  const { release: current } = (() => {
    try {
      return loadReleaseManifest(config);
    } catch (_) {
      return { release: null };
    }
  })();

  if (current && current.sha256 === latest.sha256) return null;

  const pendingPath = resolveManifestPath(config, 'pendingManifestPath', 'pending.json');
  const result = await runUpdate(config, { silent: true, writeManifestPath: pendingPath });
  if (result?.outputPath) {
    logger.info(`New release downloaded to ${result.outputPath}`);
    logger.info(`Pending manifest written to ${pendingPath}`);
  }
  return result;
}

async function verifyRuntimeIntegrity(config) {
  const requireSigned = config.release?.requireSignedRelease ?? true;
  if (!requireSigned) return;

  const allowUnsignedDev = config.release?.allowUnsignedDev ?? false;
  if (!process.pkg && allowUnsignedDev) return;
  if (!process.pkg && !allowUnsignedDev) {
    throw new Error('Refusing to run: not a signed binary (set release.allowUnsignedDev to true to bypass)');
  }

  const { release } = loadReleaseManifest(config);
  verifyReleaseObject(config, release);

  const execPath = process.execPath;
  if (!fs.existsSync(execPath)) {
    throw new Error(`Executable not found at ${execPath}`);
  }
  const digest = sha256File(execPath);
  if (digest !== release.sha256) {
    throw new Error('Executable hash does not match release manifest');
  }
}

module.exports = {
  maybeAutoUpdate,
  verifyRuntimeIntegrity
};
