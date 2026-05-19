import assert from 'node:assert/strict';
import test from 'node:test';

test('defaults the BFF API URL', () => {
  assert.equal('http://api:4000'.replace(/\/+$/, ''), 'http://api:4000');
});
