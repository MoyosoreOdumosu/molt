const test = require('node:test');
const assert = require('node:assert/strict');
const nacl = require('tweetnacl');
const {
  buildEnvelope,
  encodeEnvelope,
  decodeEnvelope,
  canonicalizeEnvelope,
  signEnvelope,
  verifyEnvelopeSignature
} = require('../src/envelope');

test('encode/decode roundtrip preserves envelope fields', () => {
  const envelope = buildEnvelope({
    type: 'PUBLIC',
    from: 'rExample',
    channel: 'topic/test',
    payload: 'hello',
    payloadRef: null,
    registrationHash: null
  });

  const hex = encodeEnvelope(envelope);
  const decoded = decodeEnvelope(hex);
  assert.deepEqual(decoded, envelope);
});

test('canonicalizeEnvelope sorts keys and excludes sig', () => {
  const envelope = {
    sig: 'abc',
    channel: 'topic/test',
    from: 'rExample',
    payload: 'hello',
    type: 'PUBLIC',
    v: 1
  };
  const canonical = canonicalizeEnvelope(envelope);
  assert.ok(!canonical.includes('"sig"'));
  assert.ok(canonical.indexOf('"channel"') < canonical.indexOf('"from"'));
});

test('signEnvelope and verifyEnvelopeSignature work with ed25519', () => {
  const keypair = nacl.sign.keyPair();
  const privateKeyBase64 = Buffer.from(keypair.secretKey).toString('base64');
  const publicKeyBase64 = Buffer.from(keypair.publicKey).toString('base64');

  const envelope = buildEnvelope({
    type: 'PRIVATE',
    from: 'rExample',
    channel: 'session/alpha',
    payload: 'encrypted'
  });

  const sig = signEnvelope(envelope, privateKeyBase64);
  const signed = { ...envelope, sig };
  assert.ok(verifyEnvelopeSignature(signed, publicKeyBase64));
});
