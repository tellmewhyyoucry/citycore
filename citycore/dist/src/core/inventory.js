"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeItem = changeItem;
const game_1 = require("../../shared/game");
const validation_1 = require("./validation");
async function changeItem(tx, actor, item, delta, kind, request) {
    // Every caller already owns the character row lock: capacity checks and slots are serialized.
    const rows = await tx('inventory').where({ character_id: actor });
    const row = rows.find(r => r.item === item), def = game_1.ITEMS[item];
    const quantity = (row?.quantity || 0) + delta;
    (0, validation_1.ensure)(quantity >= 0, 'Недостаточно предметов');
    (0, validation_1.ensure)(quantity <= def.stack, 'Превышен размер стопки');
    const weight = rows.reduce((sum, r) => sum + game_1.ITEMS[r.item].weight * r.quantity, 0);
    (0, validation_1.ensure)(weight + delta * def.weight <= game_1.RULES.maxWeight, 'Инвентарь слишком тяжёлый');
    if (!quantity)
        await tx('inventory').where({ character_id: actor, item }).delete();
    else if (row)
        await tx('inventory').where({ character_id: actor, item }).update({ quantity });
    else {
        const slot = Array.from({ length: game_1.RULES.slots }, (_, i) => i).find(i => !rows.some(r => r.slot === i));
        (0, validation_1.ensure)(slot !== undefined, 'Нет свободных слотов');
        await tx('inventory').insert({ character_id: actor, item, quantity, slot });
    }
    await tx('item_log').insert({ character_id: actor, request_id: request, kind, item, delta, created_at: Date.now() });
}
//# sourceMappingURL=inventory.js.map