"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const validation_1 = require("../src/core/validation");
const game_1 = require("../shared/game");
const limiter_1 = require("../src/infra/limiter");
(0, node_test_1.test)('bank rejects fractional, negative, huge and string amounts', () => {
    for (const amount of [-1, 0, 1.5, 1000001, '100', NaN, Infinity])
        strict_1.default.throws(() => (0, validation_1.parseAction)({ id: (0, node_crypto_1.randomUUID)(), type: 'bank.deposit', amount }));
});
(0, node_test_1.test)('client cannot inject a reward, identity or unknown action', () => {
    for (const value of [{ type: 'courier.deliver', reward: 9999 }, { type: 'courier.start', actor: 5 }, { type: 'admin.grant' }])
        strict_1.default.throws(() => (0, validation_1.parseAction)({ id: (0, node_crypto_1.randomUUID)(), ...value }));
});
(0, node_test_1.test)('transfer requires a positive recipient; every mutation requires UUID', () => {
    strict_1.default.throws(() => (0, validation_1.parseAction)({ id: 'bad', type: 'bank.deposit', amount: 1 }));
    strict_1.default.throws(() => (0, validation_1.parseAction)({ id: (0, node_crypto_1.randomUUID)(), type: 'bank.transfer', amount: 1, targetId: -1 }));
});
(0, node_test_1.test)('world rejects non-finite positions and invalid health', () => {
    strict_1.default.throws(() => (0, validation_1.parseWorld)({ position: { x: Infinity, y: 0, z: 0 }, dimension: 0, health: 100, ownVehicle: true }));
    strict_1.default.throws(() => (0, validation_1.parseWorld)({ position: game_1.LOCATIONS.bank, dimension: 0, health: 200, ownVehicle: true }));
});
(0, node_test_1.test)('credentials normalize case and enforce length', () => {
    strict_1.default.equal(validation_1.credentials.parse({ username: 'Alice_1', password: 'test-password-123' }).username, 'alice_1');
    strict_1.default.throws(() => validation_1.credentials.parse({ username: 'a', password: 'test' }));
});
(0, node_test_1.test)('distance includes height', () => strict_1.default.equal((0, game_1.distance)({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 4 }), 4));
(0, node_test_1.test)('local limiter rejects excess requests independently per actor', async () => {
    const limiter = new limiter_1.Limiter('');
    await limiter.hit('a', 1, 60000);
    await strict_1.default.rejects(limiter.hit('a', 1, 60000));
    await limiter.hit('b', 1, 60000);
    await limiter.close();
});
//# sourceMappingURL=validation.test.js.map