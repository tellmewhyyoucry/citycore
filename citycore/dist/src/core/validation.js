"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameError = exports.credentials = exports.worldSchema = void 0;
exports.parseAction = parseAction;
exports.parseWorld = parseWorld;
exports.ensure = ensure;
const zod_1 = require("zod");
const id = zod_1.z.string().uuid();
const amount = zod_1.z.number().int().positive().max(1_000_000);
const targetId = zod_1.z.number().int().positive().max(2_147_483_647);
const item = zod_1.z.enum(['water', 'sandwich', 'medkit', 'toolkit']);
const quantity = zod_1.z.number().int().positive().max(100);
const actionSchemas = {
    'courier.start': zod_1.z.object({ id, type: zod_1.z.literal('courier.start') }).strict(),
    'courier.next': zod_1.z.object({ id, type: zod_1.z.literal('courier.next') }).strict(),
    'courier.pickup': zod_1.z.object({ id, type: zod_1.z.literal('courier.pickup') }).strict(),
    'courier.deliver': zod_1.z.object({ id, type: zod_1.z.literal('courier.deliver') }).strict(),
    'courier.cancel': zod_1.z.object({ id, type: zod_1.z.literal('courier.cancel') }).strict(),
    'bank.deposit': zod_1.z.object({ id, type: zod_1.z.literal('bank.deposit'), amount }).strict(),
    'bank.withdraw': zod_1.z.object({ id, type: zod_1.z.literal('bank.withdraw'), amount }).strict(),
    'bank.transfer': zod_1.z.object({ id, type: zod_1.z.literal('bank.transfer'), amount, targetId }).strict(),
    'shop.buy': zod_1.z.object({ id, type: zod_1.z.literal('shop.buy'), item, quantity }).strict(),
    'shop.sell': zod_1.z.object({ id, type: zod_1.z.literal('shop.sell'), item, quantity }).strict(),
    'inventory.give': zod_1.z.object({ id, type: zod_1.z.literal('inventory.give'), item, quantity, targetId }).strict(),
    'inventory.use': zod_1.z.object({ id, type: zod_1.z.literal('inventory.use'), item }).strict(),
};
function parseAction(value) {
    const type = zod_1.z.object({ type: zod_1.z.string() }).parse(value).type;
    if (!Object.prototype.hasOwnProperty.call(actionSchemas, type))
        throw new GameError('Неизвестное действие');
    return actionSchemas[type].parse(value);
}
const position = zod_1.z.object({ x: zod_1.z.number().finite().min(-20000).max(20000), y: zod_1.z.number().finite().min(-20000).max(20000), z: zod_1.z.number().finite().min(-2000).max(3000) }).strict();
exports.worldSchema = zod_1.z.object({ position, dimension: zod_1.z.number().int(), health: zod_1.z.number().min(0).max(100), ownVehicle: zod_1.z.boolean(), target: zod_1.z.object({ id: targetId, position, dimension: zod_1.z.number().int() }).strict().optional() }).strict();
function parseWorld(value) { return exports.worldSchema.parse(value); }
exports.credentials = zod_1.z.object({ username: zod_1.z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{2,23}$/).transform(s => s.toLowerCase()), password: zod_1.z.string().min(10).max(100) }).strict();
class GameError extends Error {
    status;
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
exports.GameError = GameError;
function ensure(ok, message) { if (!ok)
    throw new GameError(message); }
//# sourceMappingURL=validation.js.map