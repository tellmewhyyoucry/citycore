"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrate = migrate;
const database_1 = require("./database");
const migration = {
    async up(db) {
        await db.schema.createTable('accounts', t => {
            t.engine('InnoDB');
            t.increments('id');
            t.string('username', 24).notNullable().unique();
            t.string('password_hash', 256).notNullable();
            t.string('session_hash', 64).nullable().unique();
            t.bigInteger('session_expires').notNullable().defaultTo(0);
            t.bigInteger('created_at').notNullable();
        });
        await db.schema.createTable('characters', t => {
            t.engine('InnoDB');
            t.increments('id');
            t.integer('account_id').unsigned().notNullable().unique().references('id').inTable('accounts');
            t.string('name', 24).notNullable();
            t.integer('cash').notNullable().defaultTo(1000);
            t.integer('bank').notNullable().defaultTo(0);
            t.integer('xp').notNullable().defaultTo(0);
            t.integer('hunger').notNullable().defaultTo(60);
            t.boolean('on_shift').notNullable().defaultTo(false);
            t.string('active_order', 36).nullable();
        });
        await db.schema.createTable('inventory', t => {
            t.engine('InnoDB');
            t.integer('character_id').unsigned().notNullable().references('id').inTable('characters');
            t.string('item', 24).notNullable();
            t.integer('quantity').notNullable();
            t.integer('slot').notNullable();
            t.primary(['character_id', 'item']);
            t.unique(['character_id', 'slot']);
        });
        await db.schema.createTable('orders', t => {
            t.engine('InnoDB');
            t.string('id', 36).primary();
            t.integer('character_id').unsigned().notNullable().references('id').inTable('characters');
            t.string('status', 16).notNullable();
            t.integer('destination').notNullable();
            t.integer('reward').notNullable();
            t.bigInteger('created_at').notNullable();
            t.bigInteger('picked_at').nullable();
            t.bigInteger('finished_at').nullable();
            t.index(['character_id', 'created_at']);
        });
        await db.schema.createTable('operations', t => {
            t.engine('InnoDB');
            t.integer('character_id').unsigned().notNullable().references('id').inTable('characters');
            t.string('request_id', 36).notNullable();
            t.string('fingerprint', 64).notNullable();
            t.text('result').notNullable();
            t.bigInteger('created_at').notNullable();
            t.primary(['character_id', 'request_id']);
        });
        await db.schema.createTable('ledger', t => {
            t.engine('InnoDB');
            t.increments('id');
            t.integer('character_id').unsigned().notNullable().references('id').inTable('characters');
            t.string('request_id', 36).notNullable();
            t.string('kind', 32).notNullable();
            t.integer('cash_delta').notNullable();
            t.integer('bank_delta').notNullable();
            t.integer('counterparty').unsigned().nullable();
            t.bigInteger('created_at').notNullable();
            t.index(['character_id', 'id']);
        });
        await db.schema.createTable('item_log', t => {
            t.engine('InnoDB');
            t.increments('id');
            t.integer('character_id').unsigned().notNullable().references('id').inTable('characters');
            t.string('request_id', 36).notNullable();
            t.string('kind', 32).notNullable();
            t.string('item', 24).notNullable();
            t.integer('delta').notNullable();
            t.bigInteger('created_at').notNullable();
            t.index(['character_id', 'id']);
        });
        await db.raw('ALTER TABLE characters ADD CONSTRAINT money_range CHECK (cash BETWEEN 0 AND 1000000000 AND bank BETWEEN 0 AND 1000000000), ADD CONSTRAINT hunger_range CHECK (hunger BETWEEN 0 AND 100)');
        await db.raw('ALTER TABLE inventory ADD CONSTRAINT inventory_positive CHECK (quantity > 0 AND slot BETWEEN 0 AND 7)');
    },
    async down(db) { for (const name of ['item_log', 'ledger', 'operations', 'orders', 'inventory', 'characters', 'accounts'])
        await db.schema.dropTableIfExists(name); },
};
function migrate(db) {
    return db.migrate.latest({ migrationSource: { getMigrations: async () => ['001_initial'], getMigrationName: name => String(name), getMigration: async () => migration } });
}
if (require.main === module) {
    const db = (0, database_1.connectDatabase)();
    migrate(db).then(() => console.log('MariaDB migrations complete')).catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.destroy());
}
//# sourceMappingURL=migrate.js.map