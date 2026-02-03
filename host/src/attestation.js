const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function resolvePath(relPath) {
  return path.resolve(__dirname, '..', relPath);
}

function loadAttestationEvidence(config) {
  const evidencePath = config.security?.attestation?.evidencePath;
  if (!evidencePath) return null;
  const fullPath = resolvePath(evidencePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Attestation evidence not found at ${fullPath}`);
  }
  const raw = fs.readFileSync(fullPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (_) {
    return { raw };
  }
}

function normalizeCommand(cmd) {
  if (!cmd) return null;
  if (Array.isArray(cmd)) return cmd;
  if (typeof cmd === 'string') return cmd.trim().split(/\s+/);
  return null;
}

function verifyWithCommand(command, evidence, env) {
  const [bin, ...args] = command;
  const input = JSON.stringify(evidence);
  const result = spawnSync(bin, args, { input, encoding: 'utf8', env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Attestation verifier failed');
  }
  const output = (result.stdout || '').trim();
  if (!output) throw new Error('Attestation verifier returned empty output');
  return JSON.parse(output);
}

function checkAllowlist(config, claims) {
  const allowedMrenclaves = config.security?.attestation?.allowedMrenclaves || [];
  const allowedMrsigners = config.security?.attestation?.allowedMrsigners || [];
  const minIsvSvn = Number(config.security?.attestation?.minIsvSvn ?? 0);
  const maxAgeSeconds = Number(config.security?.attestation?.maxAgeSeconds ?? 0);

  if (allowedMrenclaves.length > 0 && !allowedMrenclaves.includes(claims.mrenclave)) {
    throw new Error('MRENCLAVE not allowed');
  }
  if (allowedMrsigners.length > 0 && !allowedMrsigners.includes(claims.mrsigner)) {
    throw new Error('MRSIGNER not allowed');
  }
  if (Number.isFinite(minIsvSvn) && claims.isvsvn < minIsvSvn) {
    throw new Error('ISVSVN below minimum');
  }
  if (Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0 && claims.timestamp) {
    const age = Math.floor((Date.now() - new Date(claims.timestamp).getTime()) / 1000);
    if (age > maxAgeSeconds) throw new Error('Attestation is too old');
  }
}

function verifyAttestation(config, evidence) {
  const command = normalizeCommand(config.security?.attestation?.verifyCommand);
  if (!command) {
    throw new Error('security.attestation.verifyCommand is required when attestation is enabled');
  }
  const env = { ...process.env };
  const allowedMrenclaves = config.security?.attestation?.allowedMrenclaves || [];
  const allowedMrsigners = config.security?.attestation?.allowedMrsigners || [];
  if (allowedMrenclaves.length === 1) env.ATT_ALLOWED_MRENCLAVE = allowedMrenclaves[0];
  if (allowedMrsigners.length === 1) env.ATT_ALLOWED_MRSIGNER = allowedMrsigners[0];
  if (config.security?.attestation?.pccsUrl) env.PCCS_URL = config.security.attestation.pccsUrl;
  const claims = verifyWithCommand(command, evidence, env);
  if (!claims?.ok) {
    throw new Error('Attestation verification failed');
  }
  checkAllowlist(config, claims);
  return claims;
}

module.exports = {
  loadAttestationEvidence,
  verifyAttestation
};
