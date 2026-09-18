import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { Knex } from 'knex';
import { credentials, GameError } from './validation';
import { cancelShift } from './courier';
const scrypt = promisify(scryptCallback);
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export class AuthService {
  constructor(private db: Knex) {}
  async register(input: unknown) {
    const c = credentials.parse(input), salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(c.password, salt, 64)) as Buffer;
    try {
      await this.db.transaction(async tx => {
        const [id] = await tx('accounts').insert({ username: c.username, password_hash: `${salt}:${hash.toString('hex')}`, created_at: Date.now() });
        const [actor] = await tx('characters').insert({ account_id: id, name: c.username });
        await tx('ledger').insert({ character_id: actor, request_id: 'initial-grant', kind: 'account.welcome', cash_delta: 1000, bank_delta: 0, created_at: Date.now() });
      });
    } catch (e: any) { if (e.code === 'ER_DUP_ENTRY') throw new GameError('Имя уже занято'); throw e; }
    return { message: 'Аккаунт создан. Войдите с этим паролем' };
  }
  async login(input: unknown) {
    const c = credentials.parse(input);
    const account = await this.db('accounts').where({ username: c.username }).first();
    // Same expensive hash for missing accounts; do not reveal which usernames exist on login.
    const [salt, expected] = (account?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const hash = (await scrypt(c.password, salt, 64)) as Buffer;
    if (!account || !timingSafeEqual(hash, Buffer.from(expected, 'hex'))) throw new GameError('Неверное имя или пароль', 401);
    const token = randomBytes(32).toString('hex');
    const actor = await this.db.transaction(async tx => {
      await tx('accounts').where({ id: account.id }).forUpdate().first();
      const character = await tx('characters').where({ account_id: account.id }).forUpdate().first();
      await cancelShift(tx, character); // No persisted vehicles: reconnect always starts a clean shift.
      await tx('accounts').where({ id: account.id }).update({ session_hash: hashToken(token), session_expires: Date.now() + 24 * 3600_000 });
      return character.id as number;
    });
    return { token, actor };
  }
  async actor(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new GameError('Войдите в аккаунт', 401);
    const row = await this.db('accounts').join('characters', 'accounts.id', 'characters.account_id').where('session_hash', hashToken(token)).where('session_expires', '>', Date.now()).select('characters.id').first();
    if (!row) throw new GameError('Сессия истекла. Войдите заново', 401);
    return row.id as number;
  }
  async logout(token: string) {
    return this.db.transaction(async tx => {
      const account = await tx('accounts').where({ session_hash: hashToken(token) }).forUpdate().first();
      if (!account) return;
      const c = await tx('characters').where({ account_id: account.id }).forUpdate().first();
      await cancelShift(tx, c);
      await tx('accounts').where({ id: account.id }).update({ session_hash: null, session_expires: 0 });
    });
  }
}
