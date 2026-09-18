"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const crypto_1 = require("crypto");
const util_1 = require("util");
const validation_1 = require("./validation");
const courier_1 = require("./courier");
const scrypt = (0, util_1.promisify)(crypto_1.scrypt);
const hashToken = (token) => (0, crypto_1.createHash)('sha256').update(token).digest('hex');
class AuthService {
    db;
    constructor(db) {
        this.db = db;
    }
    async register(input) {
        const c = validation_1.credentials.parse(input), salt = (0, crypto_1.randomBytes)(16).toString('hex');
        const hash = (await scrypt(c.password, salt, 64));
        try {
            await this.db.transaction(async (tx) => {
                const [id] = await tx('accounts').insert({ username: c.username, password_hash: `${salt}:${hash.toString('hex')}`, created_at: Date.now() });
                const [actor] = await tx('characters').insert({ account_id: id, name: c.username });
                await tx('ledger').insert({ character_id: actor, request_id: 'initial-grant', kind: 'account.welcome', cash_delta: 1000, bank_delta: 0, created_at: Date.now() });
            });
        }
        catch (e) {
            if (e.code === 'ER_DUP_ENTRY')
                throw new validation_1.GameError('Имя уже занято');
            throw e;
        }
        return { message: 'Аккаунт создан. Войдите с этим паролем' };
    }
    async login(input) {
        const c = validation_1.credentials.parse(input);
        const account = await this.db('accounts').where({ username: c.username }).first();
        // Same expensive hash for missing accounts; do not reveal which usernames exist on login.
        const [salt, expected] = (account?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
        const hash = (await scrypt(c.password, salt, 64));
        if (!account || !(0, crypto_1.timingSafeEqual)(hash, Buffer.from(expected, 'hex')))
            throw new validation_1.GameError('Неверное имя или пароль', 401);
        const token = (0, crypto_1.randomBytes)(32).toString('hex');
        const actor = await this.db.transaction(async (tx) => {
            await tx('accounts').where({ id: account.id }).forUpdate().first();
            const character = await tx('characters').where({ account_id: account.id }).forUpdate().first();
            await (0, courier_1.cancelShift)(tx, character); // No persisted vehicles: reconnect always starts a clean shift.
            await tx('accounts').where({ id: account.id }).update({ session_hash: hashToken(token), session_expires: Date.now() + 24 * 3600_000 });
            return character.id;
        });
        return { token, actor };
    }
    async actor(token) {
        if (!/^[a-f0-9]{64}$/.test(token))
            throw new validation_1.GameError('Войдите в аккаунт', 401);
        const row = await this.db('accounts').join('characters', 'accounts.id', 'characters.account_id').where('session_hash', hashToken(token)).where('session_expires', '>', Date.now()).select('characters.id').first();
        if (!row)
            throw new validation_1.GameError('Сессия истекла. Войдите заново', 401);
        return row.id;
    }
    async logout(token) {
        return this.db.transaction(async (tx) => {
            const account = await tx('accounts').where({ session_hash: hashToken(token) }).forUpdate().first();
            if (!account)
                return;
            const c = await tx('characters').where({ account_id: account.id }).forUpdate().first();
            await (0, courier_1.cancelShift)(tx, c);
            await tx('accounts').where({ id: account.id }).update({ session_hash: null, session_expires: 0 });
        });
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.js.map