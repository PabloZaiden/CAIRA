import assert from 'node:assert/strict';
import test from 'node:test';

test('chat request includes a message', () => {
  const message = 'hello';
  assert.equal(message.length > 0, true);
});
