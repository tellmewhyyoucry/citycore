"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.distance = exports.ACTIONS = exports.RULES = exports.ITEMS = exports.DESTINATIONS = exports.LOCATIONS = void 0;
/** Coordinates and gameplay prices are server-owned; clients only display them. */
exports.LOCATIONS = {
    depot: { x: 78.9, y: 111.8, z: 81.2 },
    vehicle: { x: 70.1, y: 118.8, z: 79.1 },
    bank: { x: 150.1, y: -1040.5, z: 29.4 },
    shop: { x: 25.7, y: -1346.7, z: 29.5 },
};
exports.DESTINATIONS = [
    { name: 'Vespucci', x: -1213.1, y: -406.4, z: 34.1 },
    { name: 'Mirror Park', x: 1165.1, y: -323.7, z: 69.2 },
    { name: 'Rockford Hills', x: -709.7, y: -904.1, z: 19.2 },
];
exports.ITEMS = {
    water: { name: 'Вода', weight: 500, buy: 30, sell: 10, stack: 20, effect: 'food', value: 15 },
    sandwich: { name: 'Сэндвич', weight: 300, buy: 80, sell: 25, stack: 20, effect: 'food', value: 30 },
    medkit: { name: 'Аптечка', weight: 1500, buy: 350, sell: 100, stack: 5, effect: 'heal', value: 35 },
    toolkit: { name: 'Набор инструментов', weight: 3000, buy: 600, sell: 200, stack: 2, effect: 'none', value: 0 },
};
exports.RULES = { maxWeight: 20000, slots: 8, maxMoney: 1_000_000_000, salary: 500, xp: 25, minDeliveryMs: 20000, jobTtlMs: 30 * 60_000 };
exports.ACTIONS = ['courier.start', 'courier.next', 'courier.pickup', 'courier.deliver', 'courier.cancel', 'bank.deposit', 'bank.withdraw', 'bank.transfer', 'shop.buy', 'shop.sell', 'inventory.give', 'inventory.use'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
exports.distance = distance;
//# sourceMappingURL=game.js.map