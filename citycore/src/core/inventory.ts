import { Knex } from 'knex';
import { ItemId, ITEMS, RULES } from '../../shared/game';
import { ensure } from './validation';
export async function changeItem(tx: Knex.Transaction, actor: number, item: ItemId, delta: number, kind: string, request: string) {
  // Every caller already owns the character row lock: capacity checks and slots are serialized.
  const rows = await tx('inventory').where({ character_id: actor });
  const row = rows.find(r => r.item === item), def = ITEMS[item];
  const quantity = (row?.quantity || 0) + delta;
  ensure(quantity >= 0, 'Недостаточно предметов');
  ensure(quantity <= def.stack, 'Превышен размер стопки');
  const weight = rows.reduce((sum, r) => sum + ITEMS[r.item as ItemId].weight * r.quantity, 0);
  ensure(weight + delta * def.weight <= RULES.maxWeight, 'Инвентарь слишком тяжёлый');
  if (!quantity) await tx('inventory').where({ character_id: actor, item }).delete();
  else if (row) await tx('inventory').where({ character_id: actor, item }).update({ quantity });
  else {
    const slot = Array.from({ length: RULES.slots }, (_, i) => i).find(i => !rows.some(r => r.slot === i));
    ensure(slot !== undefined, 'Нет свободных слотов');
    await tx('inventory').insert({ character_id: actor, item, quantity, slot });
  }
  await tx('item_log').insert({ character_id: actor, request_id: request, kind, item, delta, created_at: Date.now() });
}
