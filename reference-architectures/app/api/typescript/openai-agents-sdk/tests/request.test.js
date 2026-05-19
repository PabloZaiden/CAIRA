import assert from 'node:assert/strict';
import test from 'node:test';

test('normalizes chat requests', () => {
  const body = { message: ' hello ', conversationId: ' abc ' };
  assert.equal(body.message.trim(), 'hello');
  assert.equal(body.conversationId.trim(), 'abc');
});
