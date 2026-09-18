"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const core_1 = require("@nestjs/core");
const app_1 = require("../src/api/app");
const migrate_1 = require("../src/infra/migrate");
const game_1 = require("../shared/game");
const name = process.env.TEST_DB_NAME;
if (!name || !/^\w+_test$/.test(name))
    throw new Error('Set TEST_DB_NAME ending in _test');
let app, base;
const key = (0, node_crypto_1.randomBytes)(32).toString('hex'), admin = (0, node_crypto_1.randomBytes)(32).toString('hex');
(0, node_test_1.before)(async () => { process.env.DB_NAME = name; process.env.BRIDGE_KEY = key; process.env.ADMIN_KEY = admin; process.env.REDIS_URL = ''; app = await core_1.NestFactory.create(app_1.AppModule, { logger: false }); app.useGlobalFilters(new app_1.ApiErrors()); await (0, migrate_1.migrate)(app.get(app_1.Services).db); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); });
(0, node_test_1.after)(async () => { await app?.close(); });
(0, node_test_1.test)('HTTP health, key boundaries and authenticated action flow', async () => {
    strict_1.default.equal((await fetch(base + '/health')).status, 200);
    strict_1.default.equal((await fetch(base + '/admin/overview')).status, 403);
    strict_1.default.equal((await fetch(base + '/admin/overview', { headers: { 'x-admin-key': key } })).status, 403);
    strict_1.default.equal((await fetch(base + '/admin/overview', { headers: { 'x-admin-key': admin } })).status, 200);
    const post = (route, body, token = '', bridge = key) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bridge-key': bridge, 'x-session': token }, body: JSON.stringify(body) });
    strict_1.default.equal((await post('/bridge/state', {}, '', 'wrong')).status, 403);
    strict_1.default.equal((await post('/bridge/state', {})).status, 401);
    const credentials = { username: 'http_' + (0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16), password: 'http-test-password' };
    strict_1.default.equal((await post('/bridge/register', { credentials, source: 'test-http' })).status, 201);
    const login = await post('/bridge/login', { credentials, source: 'test-http' });
    strict_1.default.equal(login.status, 201);
    const session = await login.json();
    const body = { action: { id: (0, node_crypto_1.randomUUID)(), type: 'bank.deposit', amount: 100 }, world: { position: game_1.LOCATIONS.bank, dimension: 0, health: 100, ownVehicle: false } };
    strict_1.default.equal((await post('/bridge/action', { ...body, actor: 999 }, session.token)).status, 400);
    strict_1.default.equal((await post('/bridge/action', body, session.token)).status, 201);
    const state = await (await post('/bridge/state', {}, session.token)).json();
    strict_1.default.equal(state.character.bank, 100);
    strict_1.default.equal(state.character.cash, 900);
    strict_1.default.equal(JSON.stringify(state).includes('password_hash'), false);
    strict_1.default.equal(JSON.stringify(state).includes('session_hash'), false);
    strict_1.default.equal((await post('/bridge/logout', {}, session.token)).status, 201);
    strict_1.default.equal((await post('/bridge/state', {}, session.token)).status, 401);
});
//# sourceMappingURL=http.integration.js.map