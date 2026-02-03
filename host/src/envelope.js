const nacl = require('tweetnacl');

function buildEnvelope({
  type,
  from,
  channel,
  payload,
  payloadRef = null,
  registrationHash = null,
  attestation = null,
  replyTo = null,
  targetHash = null,
  reaction = null,
  vote = null,
  powNonce = null,
  chunkId = null,
  chunkIndex = null,
  chunkTotal = null
}) {
  return {
    v: 1,
    type,
    from,
    channel,
    payload,
    payloadRef,
    registrationHash,
    attestation,
    replyTo,
    targetHash,
    reaction,
    vote,
    powNonce,
    chunkId,
    chunkIndex,
    chunkTotal
  };
}

function encodeEnvelope(envelope) {
  const json = JSON.stringify(envelope);
  return stringToHex(json);
}

function decodeEnvelope(hex) {
  const json = hexToString(hex);
  return JSON.parse(json);
}

function canonicalizeEnvelope(envelope) {
  const clone = { ...envelope };
  delete clone.sig;
  const keys = Object.keys(clone).sort();
  const ordered = {};
  for (const key of keys) ordered[key] = clone[key];
  return JSON.stringify(ordered);
}

function signEnvelope(envelope, privateKeyBase64) {
  if (!privateKeyBase64) return null;
  const message = Buffer.from(canonicalizeEnvelope(envelope), 'utf8');
  const secretKey = Buffer.from(privateKeyBase64, 'base64');
  const sig = nacl.sign.detached(message, secretKey);
  return Buffer.from(sig).toString('base64');
}

function verifyEnvelopeSignature(envelope, publicKeyBase64) {
  if (!publicKeyBase64 || !envelope?.sig) return false;
  const message = Buffer.from(canonicalizeEnvelope(envelope), 'utf8');
  const sig = Buffer.from(envelope.sig, 'base64');
  const pub = Buffer.from(publicKeyBase64, 'base64');
  return nacl.sign.detached.verify(message, sig, pub);
}

function stringToHex(str) {
  return Array.from(str)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function hexToString(hex) {
  const bytes = hex.match(/.{2}/g) || [];
  return bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join('');
}

module.exports = {
  buildEnvelope,
  encodeEnvelope,
  decodeEnvelope,
  canonicalizeEnvelope,
  signEnvelope,
  verifyEnvelopeSignature
};
