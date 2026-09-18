import { randomInt, randomUUID } from 'crypto';
import { Knex } from 'knex';
import { Action, ActionResult, Character, DESTINATIONS, LOCATIONS, Order, RULES, World, distance } from '../../shared/game';
import { ensure } from './validation';
import { money } from './economy';
export function near(world: World, point: { x: number; y: number; z: number }, radius = 7) {
  ensure(world.dimension === 0 && distance(world.position, point) <= radius, 'Подойдите к нужной точке');
}
export async function cancelShift(tx: Knex.Transaction, c: Character) {
  if (c.active_order) await tx('orders').where({ id: c.active_order, character_id: c.id }).whereIn('status', ['accepted', 'picked']).update({ status: 'cancelled', finished_at: Date.now() });
  await tx('characters').where({ id: c.id }).update({ on_shift: false, active_order: null });
}
export async function courier(tx: Knex.Transaction, c: Character, a: Action, world: World): Promise<ActionResult> {
  if (a.type === 'courier.cancel') { await cancelShift(tx, c); return { message: 'Смена завершена' }; }
  if (a.type === 'courier.start' || a.type === 'courier.next') {
    near(world, LOCATIONS.depot, 18);
    ensure(!c.active_order, 'Сначала завершите текущий заказ');
    ensure(a.type === 'courier.start' ? !c.on_shift : c.on_shift, a.type === 'courier.start' ? 'Смена уже началась' : 'Сначала начните смену');
    if (a.type === 'courier.next') ensure(world.ownVehicle, 'Нужен служебный транспорт');
    const id = randomUUID();
    const reward = RULES.salary + Math.min(500, Math.floor(c.xp / 100) * 50);
    await tx('orders').insert({ id, character_id: c.id, status: 'accepted', destination: randomInt(DESTINATIONS.length), reward, created_at: Date.now() });
    await tx('characters').where({ id: c.id }).update({ on_shift: true, active_order: id });
    return { message: 'Заказ принят. Заберите посылку на складе', orderId: id };
  }
  ensure(c.on_shift && c.active_order, 'Нет активного заказа');
  const order: Order = await tx('orders').where({ id: c.active_order, character_id: c.id }).first();
  ensure(order && Date.now() - Number(order.created_at) < RULES.jobTtlMs, 'Заказ истёк — завершите смену');
  ensure(world.ownVehicle, 'Сядьте в свой служебный транспорт');
  if (a.type === 'courier.pickup') {
    near(world, LOCATIONS.depot, 25); ensure(order.status === 'accepted', 'Посылка уже получена');
    await tx('orders').where({ id: order.id }).update({ status: 'picked', picked_at: Date.now() });
    return { message: 'Посылка получена. Адрес отмечен на карте' };
  }
  ensure(order.status === 'picked', 'Сначала получите посылку');
  near(world, DESTINATIONS[order.destination], 18);
  ensure(order.picked_at && Date.now() - Number(order.picked_at) >= RULES.minDeliveryMs, 'Доставка слишком быстрая');
  await money(tx, c, 0, order.reward, 'courier.salary', a.id);
  await tx('orders').where({ id: order.id }).update({ status: 'delivered', finished_at: Date.now() });
  await tx('characters').where({ id: c.id }).update({ active_order: null, xp: c.xp + RULES.xp, hunger: Math.max(0, c.hunger - 5) });
  return { message: `Доставлено! +$${order.reward} на счёт. Вернитесь за следующим заказом` };
}
