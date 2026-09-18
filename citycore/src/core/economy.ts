import { Knex } from 'knex';
import { Character, RULES } from '../../shared/game';
import { ensure } from './validation';
export async function money(tx: Knex.Transaction, c: Character, cash: number, bank: number, kind: string, request: string, peer?: number) {
  const nextCash = c.cash + cash, nextBank = c.bank + bank;
  ensure(Number.isSafeInteger(nextCash) && Number.isSafeInteger(nextBank), 'Некорректная сумма');
  ensure(nextCash >= 0 && nextBank >= 0, 'Недостаточно денег');
  ensure(nextCash <= RULES.maxMoney && nextBank <= RULES.maxMoney, 'Превышен лимит баланса');
  await tx('characters').where({ id: c.id }).update({ cash: nextCash, bank: nextBank });
  await tx('ledger').insert({ character_id: c.id, request_id: request, kind, cash_delta: cash, bank_delta: bank, counterparty: peer ?? null, created_at: Date.now() });
  c.cash = nextCash; c.bank = nextBank;
}
