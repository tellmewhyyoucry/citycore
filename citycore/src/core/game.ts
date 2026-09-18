import { createHash } from 'crypto';
import { Knex } from 'knex';
import { Action, ActionResult, Character, GameState, ITEMS, ItemId, LOCATIONS, World, distance } from '../../shared/game';
import { ensure, parseAction, parseWorld } from './validation';
import { courier, near } from './courier';
import { money } from './economy';
import { changeItem } from './inventory';
export class GameService {
  constructor(public readonly db: Knex) {}
  async execute(actor: number, rawAction: unknown, rawWorld: unknown): Promise<ActionResult> {
    const a = parseAction(rawAction), world = parseWorld(rawWorld);
    // Stable property order comes from the validated schema. World snapshots deliberately do not
    // participate: retrying a committed action after moving must return the original receipt.
    const fingerprint = createHash('sha256').update(JSON.stringify(a)).digest('hex');
    return this.db.transaction(async tx => {
      const ids = [...new Set([actor, ...(a.targetId ? [a.targetId] : [])])].sort((x, y) => x - y);
      const locked: Character[] = [];
      // Explicit ascending locks avoid AB/BA deadlocks in opposite transfers.
      for (const id of ids) {
        const row = await tx('characters').where({ id }).forUpdate().first();
        ensure(row, 'Персонаж не найден'); locked.push(row);
      }
      const c = locked.find(c => c.id === actor)!;
      const previous = await tx('operations').where({ character_id: actor, request_id: a.id }).first();
      if (previous) {
        ensure(previous.fingerprint === fingerprint, 'Этот ID уже использован для другого запроса');
        const result = JSON.parse(previous.result);
        delete result.healTo; // The GTA-side effect must not be repeated.
        return { ...result, replay: true };
      }
      ensure(world.health > 0 || a.type === 'courier.cancel', 'Действие недоступно после смерти');
      const result = await this.apply(tx, c, locked, a, world);
      await tx('operations').insert({ character_id: actor, request_id: a.id, fingerprint, result: JSON.stringify(result), created_at: Date.now() });
      return result;
    });
  }
  private async apply(tx: Knex.Transaction, c: Character, locked: Character[], a: Action, w: World): Promise<ActionResult> {
    if (a.type.startsWith('courier.')) return courier(tx, c, a, w);
    if (a.type.startsWith('bank.')) {
      near(w, LOCATIONS.bank);
      const amount = a.amount!;
      if (a.type === 'bank.deposit') await money(tx, c, -amount, amount, a.type, a.id);
      else if (a.type === 'bank.withdraw') await money(tx, c, amount, -amount, a.type, a.id);
      else {
        ensure(a.targetId !== c.id, 'Нельзя перевести самому себе');
        const target = locked.find(r => r.id === a.targetId)!;
        await money(tx, c, 0, -amount, a.type, a.id, target.id);
        await money(tx, target, 0, amount, 'bank.incoming', a.id, c.id);
      }
      return { message: 'Операция выполнена' };
    }
    const item = a.item!, def = ITEMS[item];
    if (a.type.startsWith('shop.')) {
      near(w, LOCATIONS.shop);
      const buy = a.type === 'shop.buy', quantity = a.quantity!;
      await money(tx, c, (buy ? -def.buy : def.sell) * quantity, 0, a.type, a.id);
      await changeItem(tx, c.id, item, buy ? quantity : -quantity, a.type, a.id);
      return { message: buy ? 'Покупка в инвентаре' : 'Предметы проданы' };
    }
    if (a.type === 'inventory.give') {
      ensure(a.targetId !== c.id, 'Выберите другого игрока');
      ensure(w.target && w.target.id === a.targetId && w.target.dimension === w.dimension && distance(w.position, w.target.position) <= 3, 'Получатель должен стоять рядом');
      await changeItem(tx, c.id, item, -a.quantity!, a.type, a.id);
      await changeItem(tx, a.targetId!, item, a.quantity!, 'inventory.received', a.id);
      return { message: 'Предметы переданы' };
    }
    ensure(def.effect !== 'none', 'Этот предмет нельзя использовать');
    ensure(def.effect === 'heal' ? w.health < 100 : c.hunger < 100, def.effect === 'heal' ? 'Здоровье уже полное' : 'Сытость уже полная');
    await changeItem(tx, c.id, item, -1, a.type, a.id);
    if (def.effect === 'food') await tx('characters').where({ id: c.id }).update({ hunger: Math.min(100, c.hunger + def.value) });
    return { message: `${def.name}: использовано`, ...(def.effect === 'heal' ? { healTo: Math.min(100, w.health + def.value) } : {}) };
  }
  async state(actor: number): Promise<GameState> {
    // Consistent snapshot for wallet + inventory + order even while another player transfers.
    return this.db.transaction(async tx => {
      const character: Character = await tx('characters').where({ id: actor }).first();
      ensure(character, 'Персонаж не найден');
      const inventory = await tx('inventory').select('item', 'quantity', 'slot').where({ character_id: actor }).orderBy('slot');
      const order = character.active_order ? await tx('orders').where({ id: character.active_order }).first() : null;
      const history = await tx('ledger').select('id', 'kind', 'cash_delta', 'bank_delta', 'created_at').where({ character_id: actor }).orderBy('id', 'desc').limit(12);
      return { character, inventory, order: order || null, history, weight: inventory.reduce((sum, r) => sum + ITEMS[r.item as ItemId].weight * r.quantity, 0), level: Math.floor(character.xp / 100) + 1 };
    });
  }
}
