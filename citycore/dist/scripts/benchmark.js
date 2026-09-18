"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_perf_hooks_1 = require("node:perf_hooks");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const database_1 = require("../src/infra/database");
const migrate_1 = require("../src/infra/migrate");
const auth_1 = require("../src/core/auth");
const game_1 = require("../src/core/game");
const game_2 = require("../shared/game");
async function main() {
    const name = process.env.TEST_DB_NAME;
    if (!name || !/^[a-zA-Z0-9_]+_test$/.test(name))
        throw new Error('Set a dedicated TEST_DB_NAME ending in _test');
    const db = (0, database_1.connectDatabase)(name), game = new game_1.GameService(db), auth = new auth_1.AuthService(db);
    const workers = 10, perWorker = 100, latencies = [];
    let errors = 0;
    const world = { position: game_2.LOCATIONS.bank, dimension: 0, health: 100, ownVehicle: false };
    try {
        await (0, migrate_1.migrate)(db);
        const pairs = [];
        for (let i = 0; i < workers; i++) {
            const pair = [];
            for (let j = 0; j < 2; j++) {
                const c = { username: `b_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 18)}`, password: 'benchmark-password' };
                await auth.register(c);
                const a = await auth.login(c);
                await game.execute(a.actor, { id: (0, node_crypto_1.randomUUID)(), type: 'bank.deposit', amount: 500 }, world);
                pair.push(a.actor);
            }
            pairs.push(pair);
        }
        const started = node_perf_hooks_1.performance.now();
        await Promise.all(pairs.map(async (pair) => { for (let i = 0; i < perWorker; i++) {
            const t = node_perf_hooks_1.performance.now();
            try {
                await game.execute(pair[i % 2], { id: (0, node_crypto_1.randomUUID)(), type: 'bank.transfer', targetId: pair[1 - i % 2], amount: 1 }, world);
            }
            catch {
                errors++;
            }
            latencies.push(node_perf_hooks_1.performance.now() - t);
        } }));
        const elapsed = node_perf_hooks_1.performance.now() - started;
        latencies.sort((a, b) => a - b);
        const rows = await db('characters').whereIn('id', pairs.flat());
        const conserved = rows.every(r => r.bank === 500 && r.cash === 500);
        const [version] = await db.raw('SELECT VERSION() AS version');
        const report = { scope: 'GameService + Knex + MariaDB; excludes HTTP, RAGE MP, GTA clients and authentication', date: new Date().toISOString(), node: process.version, os: (0, node_os_1.platform)(), cpu: (0, node_os_1.cpus)()[0]?.model, logicalCpus: (0, node_os_1.cpus)().length, mariadb: version[0].version, workers, requests: latencies.length, errors, conserved, elapsedMs: Math.round(elapsed), throughput: Math.round(latencies.length / (elapsed / 1000)), p50Ms: +latencies[Math.floor(latencies.length * .5)].toFixed(2), p95Ms: +latencies[Math.floor(latencies.length * .95)].toFixed(2), p99Ms: +latencies[Math.floor(latencies.length * .99)].toFixed(2) };
        (0, node_fs_1.writeFileSync)('docs/benchmark.json', JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report, null, 2));
        if (errors || !conserved)
            process.exitCode = 1;
    }
    finally {
        await db.destroy();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
//# sourceMappingURL=benchmark.js.map