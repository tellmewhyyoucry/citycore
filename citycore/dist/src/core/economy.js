"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.money = money;
const game_1 = require("../../shared/game");
const validation_1 = require("./validation");
async function money(tx, c, cash, bank, kind, request, peer) {
    const nextCash = c.cash + cash, nextBank = c.bank + bank;
    (0, validation_1.ensure)(Number.isSafeInteger(nextCash) && Number.isSafeInteger(nextBank), 'Некорректная сумма');
    (0, validation_1.ensure)(nextCash >= 0 && nextBank >= 0, 'Недостаточно денег');
    (0, validation_1.ensure)(nextCash <= game_1.RULES.maxMoney && nextBank <= game_1.RULES.maxMoney, 'Превышен лимит баланса');
    await tx('characters').where({ id: c.id }).update({ cash: nextCash, bank: nextBank });
    await tx('ledger').insert({ character_id: c.id, request_id: request, kind, cash_delta: cash, bank_delta: bank, counterparty: peer ?? null, created_at: Date.now() });
    c.cash = nextCash;
    c.bank = nextBank;
}
//# sourceMappingURL=economy.js.map