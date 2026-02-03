#!/usr/bin/env node
/**
 * Prepares artifacts for the Packer image build:
 * - Creates releases/ if needed
 * - Generates a one-time ed25519 keypair for release signing (image build only)
 * - Builds release.json from the Linux binary, signs it, writes releases/latest.json
 * - Writes config.packer.json with publisherPublicKey and paths for /opt/moltbot
 *
 * Run from host/ (project root): node infra/packer/prepare-image-build.js
 * Requires: releases/moltbot-host already built (npm run build:pkg:linux).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nacl = require('tweetnacl');

const HOST_ROOT = path.resolve(__dirname, '../..');
const RELEASES = path.join(HOST_ROOT, 'releases');
const BINARY_PATH = path.join(RELEASES, 'moltbot-host');
const CONFIG_PATH = path.join(HOST_ROOT, 'config.json');
const RELEASE_JSON = path.join(HOST_ROOT, 'release.json');
const SIGNED_JSON = path.join(HOST_ROOT, 'release.signed.json');
const LATEST_JSON = path.join(RELEASES, 'latest.json');
const PACKER_CONFIG_PATH = path.join(HOST_ROOT, 'config.packer.json');
const KEYS_PATH = path.join(HOST_ROOT, 'infra', 'packer', '.release-keys.json');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function canonicalizeRelease(release) {
  const clone = { ...release };
  delete clone.sig;
  const keys = Object.keys(clone).sort();
  const ordered = {};
  for (const key of keys) ordered[key] = clone[key];
  return JSON.stringify(ordered);
}

function signRelease(release, signingKeyBase64) {
  const message = Buffer.from(canonicalizeRelease(release), 'utf8');
  const secretKey = Buffer.from(signingKeyBase64, 'base64');
  const sig = nacl.sign.detached(message, secretKey);
  return Buffer.from(sig).toString('base64');
}

function main() {
  if (!fs.existsSync(BINARY_PATH)) {
    console.error('Binary not found at', BINARY_PATH);
    console.error('Run from host/: npm run build:pkg:linux');
    process.exit(1);
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('config.json not found at', CONFIG_PATH);
    process.exit(1);
  }

  fs.mkdirSync(RELEASES, { recursive: true });

  let publicKeyBase64;
  let signingKeyBase64;

  if (fs.existsSync(KEYS_PATH)) {
    const keys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
    publicKeyBase64 = keys.publicKeyBase64;
    signingKeyBase64 = keys.signingKeyBase64;
    console.log('Using existing release keypair from infra/packer/.release-keys.json');
  } else {
    const keypair = nacl.sign.keyPair();
    publicKeyBase64 = Buffer.from(keypair.publicKey).toString('base64');
    signingKeyBase64 = Buffer.from(keypair.secretKey).toString('base64');
    fs.writeFileSync(KEYS_PATH, JSON.stringify({ publicKeyBase64, signingKeyBase64 }, null, 2));
    console.log('Generated new release keypair; saved to infra/packer/.release-keys.json');
  }

  const sha256 = sha256File(BINARY_PATH);
  const releaseObj = {
    type: 'RELEASE',
    name: 'moltbot-host',
    version: require(path.join(HOST_ROOT, 'package.json')).version || '0.1.0',
    publishedAt: new Date().toISOString(),
    sha256
  };

  releaseObj.sig = signRelease(releaseObj, signingKeyBase64);
  fs.writeFileSync(LATEST_JSON, JSON.stringify(releaseObj, null, 2));
  console.log('Written', LATEST_JSON);

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  config.release = config.release || {};
  config.release.publisherPublicKey = publicKeyBase64;
  config.release.manifestPath = './releases/latest.json';
  config.release.pendingManifestPath = './releases/pending.json';
  config.storage = config.storage || {};
  config.storage.path = '/opt/moltbot/data';

  fs.writeFileSync(PACKER_CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('Written', PACKER_CONFIG_PATH);

  console.log('Ready for Packer. Run:');
  console.log('  cd infra/packer');
  console.log('  packer init .');
  console.log('  packer build -var "moltbot_binary=../../releases/moltbot-host" -var "moltbot_config=../../config.packer.json" -var "release_manifest=../../releases/latest.json" .');
}

main();
