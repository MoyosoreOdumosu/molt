const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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

function main() {
  const configPath = process.argv[2] || path.resolve(process.cwd(), 'config.json');
  const config = loadJson(configPath);
  const att = config.security?.attestation || {};
  const evidencePath = att.evidencePath ? path.resolve(process.cwd(), att.evidencePath) : null;
  const verifyCommand = normalizeCommand(att.verifyCommand);

  if (!evidencePath) throw new Error('security.attestation.evidencePath not set');
  if (!verifyCommand) throw new Error('security.attestation.verifyCommand not set');
  if (!fs.existsSync(evidencePath)) throw new Error(`Evidence not found at ${evidencePath}`);

  const evidence = loadJson(evidencePath);
  const env = { ...process.env };
  if (att.pccsUrl) env.PCCS_URL = att.pccsUrl;

  const claims = verifyWithCommand(verifyCommand, evidence, env);
  if (!claims?.ok) throw new Error('Attestation verification failed');

  const mrenclave = claims.mrenclave || '';
  const mrsigner = claims.mrsigner || '';

  config.security = config.security || {};
  config.security.attestation = config.security.attestation || {};
  const allowedMrenclaves = config.security.attestation.allowedMrenclaves || [];
  const allowedMrsigners = config.security.attestation.allowedMrsigners || [];

  if (mrenclave && !allowedMrenclaves.includes(mrenclave)) {
    allowedMrenclaves.push(mrenclave);
  }
  if (mrsigner && !allowedMrsigners.includes(mrsigner)) {
    allowedMrsigners.push(mrsigner);
  }

  config.security.attestation.allowedMrenclaves = allowedMrenclaves;
  config.security.attestation.allowedMrsigners = allowedMrsigners;

  saveJson(configPath, config);
  process.stdout.write(`Pinned MRENCLAVE/MRSIGNER into ${configPath}\n`);
}

main();
