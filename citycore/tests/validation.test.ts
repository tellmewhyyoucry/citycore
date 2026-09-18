import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { credentials, parseAction, parseWorld } from '../src/core/validation';
import { LOCATIONS, distance } from '../shared/game';
import { Limiter } from '../src/infra/limiter';
test('bank rejects fractional, negative, huge and string amounts', () => {
  for (const amount of [-1, 0, 1.5, 1000001, '100', NaN, Infinity]) assert.throws(() => parseAction({ id: randomUUID(), type: 'bank.deposit', amount }));
});
test('client cannot inject a reward, identity or unknown action', () => {
  for (const value of [{ type: 'courier.deliver', reward: 9999 }, { type: 'courier.start', actor: 5 }, { type: 'admin.grant' }]) assert.throws(() => parseAction({ id: randomUUID(), ...value }));
});
test('transfer requires a positive recipient; every mutation requires UUID', () => {
  assert.throws(() => parseAction({ id: 'bad', type: 'bank.deposit', amount: 1 }));
  assert.throws(() => parseAction({ id: randomUUID(), type: 'bank.transfer', amount: 1, targetId: -1 }));
});
test('world rejects non-finite positions and invalid health', () => {
  assert.throws(() => parseWorld({ position: { x: Infinity, y: 0, z: 0 }, dimension: 0, health: 100, ownVehicle: true }));
  assert.throws(() => parseWorld({ position: LOCATIONS.bank, dimension: 0, health: 200, ownVehicle: true }));
});
test('credentials normalize case and enforce length', () => {
  assert.equal(credentials.parse({ username: 'Alice_1', password: 'test-password-123' }).username, 'alice_1');
  assert.throws(() => credentials.parse({ username: 'a', password: 'test' }));
});
test('distance includes height', () => assert.equal(distance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 4 }), 4));
test('local limiter rejects excess requests independently per actor', async () => {
  const limiter = new Limiter('');
  await limiter.hit('a', 1, 60000);
  await assert.rejects(limiter.hit('a', 1, 60000));
  await limiter.hit('b', 1, 60000); await limiter.close();
});
