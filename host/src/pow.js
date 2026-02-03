const crypto = require('crypto');
const { canonicalizeEnvelope } = require('./envelope');

function hashEnvelope(envelope, salt) {
  const canonical = canonicalizeEnvelope(envelope);
  const payload = salt ? `${canonical}|${salt}` : canonical;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function hasLeadingZeros(hex, zeros) {
  if (zeros <= 0) return true;
  return hex.startsWith('0'.repeat(zeros));
}

function solvePow(envelope, difficulty, salt) {
  let nonce = 0;
  let candidate = envelope;
  while (true) {
    candidate = { ...envelope, powNonce: String(nonce) };
    const digest = hashEnvelope(candidate, salt);
    if (hasLeadingZeros(digest, difficulty)) {
      return { envelope: candidate, digest };
    }
    nonce += 1;
  }
}

function verifyPow(envelope, difficulty, salt) {
  if (!envelope?.powNonce) return false;
  const digest = hashEnvelope(envelope, salt);
  return hasLeadingZeros(digest, difficulty);
}

module.exports = {
  solvePow,
  verifyPow
};
