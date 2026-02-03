const test = require('node:test');
const assert = require('node:assert/strict');
const { solvePow, verifyPow } = require('../src/pow');

test('solvePow finds nonce such that hash has leading zeros', () => {
  const envelope = {
    v: 1,
    type: 'PUBLIC',
    from: 'rBot123',
    channel: 'topic/test',
    payload: 'hello'
  };
  const difficulty = 4;
  const salt = 'moltbot-pow-v1';

  const { envelope: solved, digest } = solvePow(envelope, difficulty, salt);

  assert.ok(solved.powNonce !== undefined);
  assert.ok(typeof solved.powNonce === 'string');
  assert.ok(digest.startsWith('0'.repeat(difficulty)), `digest should start with ${difficulty} zeros, got: ${digest}`);
});

test('verifyPow accepts valid solved envelope', () => {
  const envelope = {
    v: 1,
    type: 'PUBLIC',
    from: 'rBot123',
    channel: 'topic/test',
    payload: 'hello'
  };
  const { envelope: solved } = solvePow(envelope, 4, 'moltbot-pow-v1');

  assert.ok(verifyPow(solved, 4, 'moltbot-pow-v1'));
});

test('verifyPow rejects envelope without powNonce', () => {
  const envelope = {
    v: 1,
    type: 'PUBLIC',
    from: 'rBot123',
    channel: 'topic/test',
    payload: 'hello'
  };
  assert.ok(!verifyPow(envelope, 4, 'moltbot-pow-v1'));
});

test('verifyPow rejects tampered envelope (wrong nonce)', () => {
  const envelope = {
    v: 1,
    type: 'PUBLIC',
    from: 'rBot123',
    channel: 'topic/test',
    payload: 'hello'
  };
  const { envelope: solved } = solvePow(envelope, 4, 'moltbot-pow-v1');
  const tampered = { ...solved, powNonce: '999999' };

  assert.ok(!verifyPow(tampered, 4, 'moltbot-pow-v1'));
});

test('verifyPow rejects envelope with wrong salt', () => {
  const envelope = {
    v: 1,
    type: 'PUBLIC',
    from: 'rBot123',
    channel: 'topic/test',
    payload: 'hello'
  };
  const { envelope: solved } = solvePow(envelope, 4, 'salt-a');

  assert.ok(!verifyPow(solved, 4, 'salt-b'));
});

test('higher difficulty requires more leading zeros', () => {
  const envelope = {
    v: 1,
    type: 'PUBLIC',
    from: 'rBot123',
    channel: 'topic/test',
    payload: 'test'
  };
  const salt = 'moltbot-pow-v1';

  const easy = solvePow(envelope, 2, salt);
  const hard = solvePow(envelope, 5, salt);

  assert.ok(easy.digest.startsWith('00'));
  assert.ok(hard.digest.startsWith('00000'));
});
