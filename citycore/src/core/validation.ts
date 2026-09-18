import { z } from 'zod';
import { Action, World } from '../../shared/game';
const id = z.string().uuid();
const amount = z.number().int().positive().max(1_000_000);
const targetId = z.number().int().positive().max(2_147_483_647);
const item = z.enum(['water', 'sandwich', 'medkit', 'toolkit']);
const quantity = z.number().int().positive().max(100);
const actionSchemas = {
  'courier.start': z.object({ id, type: z.literal('courier.start') }).strict(),
  'courier.next': z.object({ id, type: z.literal('courier.next') }).strict(),
  'courier.pickup': z.object({ id, type: z.literal('courier.pickup') }).strict(),
  'courier.deliver': z.object({ id, type: z.literal('courier.deliver') }).strict(),
  'courier.cancel': z.object({ id, type: z.literal('courier.cancel') }).strict(),
  'bank.deposit': z.object({ id, type: z.literal('bank.deposit'), amount }).strict(),
  'bank.withdraw': z.object({ id, type: z.literal('bank.withdraw'), amount }).strict(),
  'bank.transfer': z.object({ id, type: z.literal('bank.transfer'), amount, targetId }).strict(),
  'shop.buy': z.object({ id, type: z.literal('shop.buy'), item, quantity }).strict(),
  'shop.sell': z.object({ id, type: z.literal('shop.sell'), item, quantity }).strict(),
  'inventory.give': z.object({ id, type: z.literal('inventory.give'), item, quantity, targetId }).strict(),
  'inventory.use': z.object({ id, type: z.literal('inventory.use'), item }).strict(),
};
export function parseAction(value: unknown): Action {
  const type = z.object({ type: z.string() }).parse(value).type;
  if (!Object.prototype.hasOwnProperty.call(actionSchemas, type)) throw new GameError('Неизвестное действие');
  return actionSchemas[type as keyof typeof actionSchemas].parse(value) as Action;
}
const position = z.object({ x: z.number().finite().min(-20000).max(20000), y: z.number().finite().min(-20000).max(20000), z: z.number().finite().min(-2000).max(3000) }).strict();
export const worldSchema = z.object({ position, dimension: z.number().int(), health: z.number().min(0).max(100), ownVehicle: z.boolean(), target: z.object({ id: targetId, position, dimension: z.number().int() }).strict().optional() }).strict();
export function parseWorld(value: unknown): World { return worldSchema.parse(value); }
export const credentials = z.object({ username: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{2,23}$/).transform(s => s.toLowerCase()), password: z.string().min(10).max(100) }).strict();
export class GameError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function ensure(ok: unknown, message: string): asserts ok { if (!ok) throw new GameError(message); }
