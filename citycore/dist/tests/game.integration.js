"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const database_1 = require("../src/infra/database");
const migrate_1 = require("../src/infra/migrate");
const auth_1 = require("../src/core/auth");
const game_1 = require("../src/core/game");
const game_2 = require("../shared/game");
const name = process.env.TEST_DB_NAME;
if (!name || !/^[a-zA-Z0-9_]+_test$/.test(name))
    throw new Error('Set TEST_DB_NAME ending in _test. Integration tests never use DB_NAME.');
const db = (0, database_1.connectDatabase)(name), auth = new auth_1.AuthService(db), game = new game_1.GameService(db);
const world = (point = game_2.LOCATIONS.bank, ownVehicle = true) => ({ position: { x: point.x, y: point.y, z: point.z }, health: 70, ownVehicle, dimension: 0 });
const action = (type, fields = {}) => ({ id: (0, node_crypto_1.randomUUID)(), type, ...fields });
async function account() { const username = `t_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 18)}`, password = 'integration-password'; await auth.register({ username, password }); return { ...(await auth.login({ username, password })), username, password }; }
async function funded() { const a = await account(); await game.execute(a.actor, action('bank.deposit', { amount: 500 }), world()); return a; }
(0, node_test_1.before)(async () => { await (0, migrate_1.migrate)(db); });
(0, node_test_1.after)(async () => { await db.destroy(); });
(0, node_test_1.test)('same simultaneous deposit request commits once', async () => {
    const a = await account(), request = action('bank.deposit', { amount: 100 });
    const results = await Promise.all(Array.from({ length: 12 }, () => game.execute(a.actor, request, world())));
    strict_1.default.equal(results.filter(r => !r.replay).length, 1);
    const s = await game.state(a.actor);
    strict_1.default.equal(s.character.cash, 900);
    strict_1.default.equal(s.character.bank, 100);
    strict_1.default.equal((await db('ledger').where({ character_id: a.actor, kind: 'bank.deposit' })).length, 1);
});
(0, node_test_1.test)('opposite transfers avoid deadlocks and conserve money', async () => {
    const a = await funded(), b = await funded();
    await Promise.all(Array.from({ length: 30 }, (_, i) => game.execute(i % 2 ? a.actor : b.actor, action('bank.transfer', { targetId: i % 2 ? b.actor : a.actor, amount: 10 }), world())));
    strict_1.default.equal((await game.state(a.actor)).character.bank, 500);
    strict_1.default.equal((await game.state(b.actor)).character.bank, 500);
});
(0, node_test_1.test)('concurrent overspend permits only available balance', async () => {
    const a = await funded(), b = await funded();
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => game.execute(a.actor, action('bank.transfer', { targetId: b.actor, amount: 300 }), world())));
    strict_1.default.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    strict_1.default.equal((await game.state(a.actor)).character.bank, 200);
    strict_1.default.equal((await game.state(b.actor)).character.bank, 800);
});
(0, node_test_1.test)('recipient limit rolls back sender debit and ledger', async () => {
    const a = await funded(), b = await funded();
    await db('characters').where({ id: b.actor }).update({ bank: 1_000_000_000 });
    const request = action('bank.transfer', { targetId: b.actor, amount: 1 });
    await strict_1.default.rejects(game.execute(a.actor, request, world()));
    strict_1.default.equal((await game.state(a.actor)).character.bank, 500);
    strict_1.default.equal((await db('ledger').where({ request_id: request.id })).length, 0);
});
(0, node_test_1.test)('request ID cannot be reused with changed payload', async () => {
    const a = await account(), request = action('bank.deposit', { amount: 100 });
    await game.execute(a.actor, request, world());
    await strict_1.default.rejects(game.execute(a.actor, { ...request, amount: 200 }, world()));
});
(0, node_test_1.test)('last item cannot be duplicated between two simultaneous recipients', async () => {
    const a = await account(), b = await account(), c = await account();
    await game.execute(a.actor, action('shop.buy', { item: 'water', quantity: 1 }), world(game_2.LOCATIONS.shop));
    const results = await Promise.allSettled([b, c].map(target => game.execute(a.actor, action('inventory.give', { item: 'water', quantity: 1, targetId: target.actor }), { ...world(), target: { id: target.actor, position: game_2.LOCATIONS.bank, dimension: 0 } })));
    strict_1.default.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const rows = await db('inventory').whereIn('character_id', [a.actor, b.actor, c.actor]);
    strict_1.default.equal(rows.reduce((s, r) => s + r.quantity, 0), 1);
});
(0, node_test_1.test)('full recipient inventory rolls back item removal', async () => {
    const a = await account(), b = await account();
    await game.execute(a.actor, action('shop.buy', { item: 'water', quantity: 1 }), world(game_2.LOCATIONS.shop));
    await game.execute(b.actor, action('shop.buy', { item: 'water', quantity: 20 }), world(game_2.LOCATIONS.shop));
    await strict_1.default.rejects(game.execute(a.actor, action('inventory.give', { item: 'water', quantity: 1, targetId: b.actor }), { ...world(), target: { id: b.actor, position: game_2.LOCATIONS.bank, dimension: 0 } }));
    strict_1.default.equal((await game.state(a.actor)).inventory[0].quantity, 1);
});
(0, node_test_1.test)('overweight purchase rolls back debit', async () => {
    const a = await account();
    await db('characters').where({ id: a.actor }).update({ cash: 100000 });
    for (const [item, quantity] of [['water', 20], ['sandwich', 20], ['toolkit', 1]])
        await game.execute(a.actor, action('shop.buy', { item, quantity }), world(game_2.LOCATIONS.shop));
    const before = (await game.state(a.actor)).character.cash;
    await strict_1.default.rejects(game.execute(a.actor, action('shop.buy', { item: 'medkit', quantity: 1 }), world(game_2.LOCATIONS.shop)));
    strict_1.default.equal((await game.state(a.actor)).character.cash, before);
});
(0, node_test_1.test)('sell and consume persist quantities, cash and hunger', async () => {
    const a = await account();
    await game.execute(a.actor, action('shop.buy', { item: 'sandwich', quantity: 3 }), world(game_2.LOCATIONS.shop));
    await game.execute(a.actor, action('inventory.use', { item: 'sandwich' }), world());
    await game.execute(a.actor, action('shop.sell', { item: 'sandwich', quantity: 1 }), world(game_2.LOCATIONS.shop));
    const s = await game.state(a.actor);
    strict_1.default.equal(s.character.hunger, 90);
    strict_1.default.equal(s.character.cash, 785);
    strict_1.default.equal(s.inventory[0].quantity, 1);
});
(0, node_test_1.test)('courier cannot pay early, remotely, or without own vehicle; duplicate completion pays once', async () => {
    const a = await account();
    await game.execute(a.actor, action('courier.start'), world(game_2.LOCATIONS.depot, false));
    await strict_1.default.rejects(game.execute(a.actor, action('courier.deliver'), world(game_2.LOCATIONS.depot)));
    await game.execute(a.actor, action('courier.pickup'), world(game_2.LOCATIONS.depot));
    const order = (await game.state(a.actor)).order;
    await strict_1.default.rejects(game.execute(a.actor, action('courier.deliver'), world(game_2.DESTINATIONS[order.destination])));
    await db('orders').where({ id: order.id }).update({ picked_at: Date.now() - 30000 });
    await strict_1.default.rejects(game.execute(a.actor, action('courier.deliver'), world(game_2.LOCATIONS.depot)));
    await strict_1.default.rejects(game.execute(a.actor, action('courier.deliver'), world(game_2.DESTINATIONS[order.destination], false)));
    const request = action('courier.deliver');
    await Promise.all([game.execute(a.actor, request, world(game_2.DESTINATIONS[order.destination])), game.execute(a.actor, request, world(game_2.DESTINATIONS[order.destination]))]);
    await strict_1.default.rejects(game.execute(a.actor, action('courier.deliver'), world(game_2.DESTINATIONS[order.destination])));
    const s = await game.state(a.actor);
    strict_1.default.equal(s.character.bank, 500);
    strict_1.default.equal(s.character.xp, 25);
    strict_1.default.equal(s.order, null);
    strict_1.default.equal(s.character.on_shift, 1);
});
(0, node_test_1.test)('logout and reconnect cancel unfinished shift without payment, persist inventory and invalidate old session', async () => {
    const a = await funded();
    await game.execute(a.actor, action('shop.buy', { item: 'water', quantity: 2 }), world(game_2.LOCATIONS.shop));
    await game.execute(a.actor, action('courier.start'), world(game_2.LOCATIONS.depot));
    await auth.logout(a.token);
    await strict_1.default.rejects(auth.actor(a.token));
    const fresh = await auth.login({ username: a.username, password: a.password });
    const s = await game.state(fresh.actor);
    strict_1.default.equal(s.character.bank, 500);
    strict_1.default.equal(s.inventory[0].quantity, 2);
    strict_1.default.equal(s.character.on_shift, 0);
    strict_1.default.equal(s.order, null);
});
(0, node_test_1.test)('new login invalidates previous session', async () => {
    const a = await account();
    const fresh = await auth.login({ username: a.username, password: a.password });
    await strict_1.default.rejects(auth.actor(a.token));
    strict_1.default.equal(await auth.actor(fresh.token), a.actor);
});
(0, node_test_1.test)('distance, dimensions, unknown target and unaffordable purchases are rejected', async () => {
    const a = await account(), b = await account();
    await strict_1.default.rejects(game.execute(a.actor, action('bank.deposit', { amount: 1 }), world(game_2.LOCATIONS.depot)));
    await strict_1.default.rejects(game.execute(a.actor, action('bank.deposit', { amount: 1 }), { ...world(), dimension: 1 }));
    await strict_1.default.rejects(game.execute(a.actor, action('bank.transfer', { amount: 1, targetId: 2147483647 }), world()));
    await strict_1.default.rejects(game.execute(a.actor, action('shop.buy', { item: 'toolkit', quantity: 2 }), world(game_2.LOCATIONS.shop)));
    await strict_1.default.rejects(game.execute(a.actor, action('inventory.give', { item: 'water', quantity: 1, targetId: b.actor }), { ...world(), target: { id: b.actor, position: game_2.LOCATIONS.bank, dimension: 1 } }));
});
(0, node_test_1.test)('medkit consumes once and does not replay GTA health effect', async () => {
    const a = await account();
    await game.execute(a.actor, action('shop.buy', { item: 'medkit', quantity: 1 }), world(game_2.LOCATIONS.shop));
    const request = action('inventory.use', { item: 'medkit' });
    strict_1.default.equal((await game.execute(a.actor, request, world())).healTo, 100);
    strict_1.default.equal((await game.execute(a.actor, request, world())).healTo, undefined);
    strict_1.default.equal((await game.state(a.actor)).inventory.length, 0);
});
(0, node_test_1.test)('state survives a fresh database connection and migration is repeatable', async () => {
    const a = await funded();
    await (0, migrate_1.migrate)(db);
    const fresh = (0, database_1.connectDatabase)(name);
    try {
        strict_1.default.equal((await new game_1.GameService(fresh).state(a.actor)).character.bank, 500);
    }
    finally {
        await fresh.destroy();
    }
});
//# sourceMappingURL=game.integration.js.map