"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.near = near;
exports.cancelShift = cancelShift;
exports.courier = courier;
const crypto_1 = require("crypto");
const game_1 = require("../../shared/game");
const validation_1 = require("./validation");
const economy_1 = require("./economy");
function near(world, point, radius = 7) {
    (0, validation_1.ensure)(world.dimension === 0 && (0, game_1.distance)(world.position, point) <= radius, 'Подойдите к нужной точке');
}
async function cancelShift(tx, c) {
    if (c.active_order)
        await tx('orders').where({ id: c.active_order, character_id: c.id }).whereIn('status', ['accepted', 'picked']).update({ status: 'cancelled', finished_at: Date.now() });
    await tx('characters').where({ id: c.id }).update({ on_shift: false, active_order: null });
}
async function courier(tx, c, a, world) {
    if (a.type === 'courier.cancel') {
        await cancelShift(tx, c);
        return { message: 'Смена завершена' };
    }
    if (a.type === 'courier.start' || a.type === 'courier.next') {
        near(world, game_1.LOCATIONS.depot, 18);
        (0, validation_1.ensure)(!c.active_order, 'Сначала завершите текущий заказ');
        (0, validation_1.ensure)(a.type === 'courier.start' ? !c.on_shift : c.on_shift, a.type === 'courier.start' ? 'Смена уже началась' : 'Сначала начните смену');
        if (a.type === 'courier.next')
            (0, validation_1.ensure)(world.ownVehicle, 'Нужен служебный транспорт');
        const id = (0, crypto_1.randomUUID)();
        const reward = game_1.RULES.salary + Math.min(500, Math.floor(c.xp / 100) * 50);
        await tx('orders').insert({ id, character_id: c.id, status: 'accepted', destination: (0, crypto_1.randomInt)(game_1.DESTINATIONS.length), reward, created_at: Date.now() });
        await tx('characters').where({ id: c.id }).update({ on_shift: true, active_order: id });
        return { message: 'Заказ принят. Заберите посылку на складе', orderId: id };
    }
    (0, validation_1.ensure)(c.on_shift && c.active_order, 'Нет активного заказа');
    const order = await tx('orders').where({ id: c.active_order, character_id: c.id }).first();
    (0, validation_1.ensure)(order && Date.now() - Number(order.created_at) < game_1.RULES.jobTtlMs, 'Заказ истёк — завершите смену');
    (0, validation_1.ensure)(world.ownVehicle, 'Сядьте в свой служебный транспорт');
    if (a.type === 'courier.pickup') {
        near(world, game_1.LOCATIONS.depot, 25);
        (0, validation_1.ensure)(order.status === 'accepted', 'Посылка уже получена');
        await tx('orders').where({ id: order.id }).update({ status: 'picked', picked_at: Date.now() });
        return { message: 'Посылка получена. Адрес отмечен на карте' };
    }
    (0, validation_1.ensure)(order.status === 'picked', 'Сначала получите посылку');
    near(world, game_1.DESTINATIONS[order.destination], 18);
    (0, validation_1.ensure)(order.picked_at && Date.now() - Number(order.picked_at) >= game_1.RULES.minDeliveryMs, 'Доставка слишком быстрая');
    await (0, economy_1.money)(tx, c, 0, order.reward, 'courier.salary', a.id);
    await tx('orders').where({ id: order.id }).update({ status: 'delivered', finished_at: Date.now() });
    await tx('characters').where({ id: c.id }).update({ active_order: null, xp: c.xp + game_1.RULES.xp, hunger: Math.max(0, c.hunger - 5) });
    return { message: `Доставлено! +$${order.reward} на счёт. Вернитесь за следующим заказом` };
}
//# sourceMappingURL=courier.js.map