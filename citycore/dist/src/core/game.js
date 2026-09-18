"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameService = void 0;
const crypto_1 = require("crypto");
const game_1 = require("../../shared/game");
const validation_1 = require("./validation");
const courier_1 = require("./courier");
const economy_1 = require("./economy");
const inventory_1 = require("./inventory");
class GameService {
    db;
    constructor(db) {
        this.db = db;
    }
    async execute(actor, rawAction, rawWorld) {
        const a = (0, validation_1.parseAction)(rawAction), world = (0, validation_1.parseWorld)(rawWorld);
        // Stable property order comes from the validated schema. World snapshots deliberately do not
        // participate: retrying a committed action after moving must return the original receipt.
        const fingerprint = (0, crypto_1.createHash)('sha256').update(JSON.stringify(a)).digest('hex');
        return this.db.transaction(async (tx) => {
            const ids = [...new Set([actor, ...(a.targetId ? [a.targetId] : [])])].sort((x, y) => x - y);
            const locked = [];
            // Explicit ascending locks avoid AB/BA deadlocks in opposite transfers.
            for (const id of ids) {
                const row = await tx('characters').where({ id }).forUpdate().first();
                (0, validation_1.ensure)(row, 'Персонаж не найден');
                locked.push(row);
            }
            const c = locked.find(c => c.id === actor);
            const previous = await tx('operations').where({ character_id: actor, request_id: a.id }).first();
            if (previous) {
                (0, validation_1.ensure)(previous.fingerprint === fingerprint, 'Этот ID уже использован для другого запроса');
                const result = JSON.parse(previous.result);
                delete result.healTo; // The GTA-side effect must not be repeated.
                return { ...result, replay: true };
            }
            (0, validation_1.ensure)(world.health > 0 || a.type === 'courier.cancel', 'Действие недоступно после смерти');
            const result = await this.apply(tx, c, locked, a, world);
            await tx('operations').insert({ character_id: actor, request_id: a.id, fingerprint, result: JSON.stringify(result), created_at: Date.now() });
            return result;
        });
    }
    async apply(tx, c, locked, a, w) {
        if (a.type.startsWith('courier.'))
            return (0, courier_1.courier)(tx, c, a, w);
        if (a.type.startsWith('bank.')) {
            (0, courier_1.near)(w, game_1.LOCATIONS.bank);
            const amount = a.amount;
            if (a.type === 'bank.deposit')
                await (0, economy_1.money)(tx, c, -amount, amount, a.type, a.id);
            else if (a.type === 'bank.withdraw')
                await (0, economy_1.money)(tx, c, amount, -amount, a.type, a.id);
            else {
                (0, validation_1.ensure)(a.targetId !== c.id, 'Нельзя перевести самому себе');
                const target = locked.find(r => r.id === a.targetId);
                await (0, economy_1.money)(tx, c, 0, -amount, a.type, a.id, target.id);
                await (0, economy_1.money)(tx, target, 0, amount, 'bank.incoming', a.id, c.id);
            }
            return { message: 'Операция выполнена' };
        }
        const item = a.item, def = game_1.ITEMS[item];
        if (a.type.startsWith('shop.')) {
            (0, courier_1.near)(w, game_1.LOCATIONS.shop);
            const buy = a.type === 'shop.buy', quantity = a.quantity;
            await (0, economy_1.money)(tx, c, (buy ? -def.buy : def.sell) * quantity, 0, a.type, a.id);
            await (0, inventory_1.changeItem)(tx, c.id, item, buy ? quantity : -quantity, a.type, a.id);
            return { message: buy ? 'Покупка в инвентаре' : 'Предметы проданы' };
        }
        if (a.type === 'inventory.give') {
            (0, validation_1.ensure)(a.targetId !== c.id, 'Выберите другого игрока');
            (0, validation_1.ensure)(w.target && w.target.id === a.targetId && w.target.dimension === w.dimension && (0, game_1.distance)(w.position, w.target.position) <= 3, 'Получатель должен стоять рядом');
            await (0, inventory_1.changeItem)(tx, c.id, item, -a.quantity, a.type, a.id);
            await (0, inventory_1.changeItem)(tx, a.targetId, item, a.quantity, 'inventory.received', a.id);
            return { message: 'Предметы переданы' };
        }
        (0, validation_1.ensure)(def.effect !== 'none', 'Этот предмет нельзя использовать');
        (0, validation_1.ensure)(def.effect === 'heal' ? w.health < 100 : c.hunger < 100, def.effect === 'heal' ? 'Здоровье уже полное' : 'Сытость уже полная');
        await (0, inventory_1.changeItem)(tx, c.id, item, -1, a.type, a.id);
        if (def.effect === 'food')
            await tx('characters').where({ id: c.id }).update({ hunger: Math.min(100, c.hunger + def.value) });
        return { message: `${def.name}: использовано`, ...(def.effect === 'heal' ? { healTo: Math.min(100, w.health + def.value) } : {}) };
    }
    async state(actor) {
        // Consistent snapshot for wallet + inventory + order even while another player transfers.
        return this.db.transaction(async (tx) => {
            const character = await tx('characters').where({ id: actor }).first();
            (0, validation_1.ensure)(character, 'Персонаж не найден');
            const inventory = await tx('inventory').select('item', 'quantity', 'slot').where({ character_id: actor }).orderBy('slot');
            const order = character.active_order ? await tx('orders').where({ id: character.active_order }).first() : null;
            const history = await tx('ledger').select('id', 'kind', 'cash_delta', 'bank_delta', 'created_at').where({ character_id: actor }).orderBy('id', 'desc').limit(12);
            return { character, inventory, order: order || null, history, weight: inventory.reduce((sum, r) => sum + game_1.ITEMS[r.item].weight * r.quantity, 0), level: Math.floor(character.xp / 100) + 1 };
        });
    }
}
exports.GameService = GameService;
//# sourceMappingURL=game.js.map