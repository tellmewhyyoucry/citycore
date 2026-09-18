"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = exports.ApiErrors = exports.ApiController = exports.Services = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const database_1 = require("../infra/database");
const game_1 = require("../core/game");
const auth_1 = require("../core/auth");
const validation_1 = require("../core/validation");
const limiter_1 = require("../infra/limiter");
function secret(value, expected) {
    if (typeof value !== 'string' || !expected || expected.length < 32)
        throw new validation_1.GameError('Доступ запрещён', 403);
    const a = Buffer.from(value), b = Buffer.from(expected);
    if (a.length !== b.length || !(0, crypto_1.timingSafeEqual)(a, b))
        throw new validation_1.GameError('Доступ запрещён', 403);
}
let Services = class Services {
    db = (0, database_1.connectDatabase)();
    game = new game_1.GameService(this.db);
    auth = new auth_1.AuthService(this.db);
    limiter = new limiter_1.Limiter();
    async onModuleInit() { await this.db.raw('SELECT 1'); await this.limiter.init(); }
    async onModuleDestroy() { await this.limiter.close(); await this.db.destroy(); }
};
exports.Services = Services;
exports.Services = Services = __decorate([
    (0, common_1.Injectable)()
], Services);
let ApiController = class ApiController {
    services;
    constructor(services) {
        this.services = services;
    }
    async health() { await this.services.db.raw('SELECT 1'); return { ok: true, project: 'CityCore RP' }; }
    async register(key, body) {
        secret(key, process.env.BRIDGE_KEY);
        const input = zod_1.z.object({ credentials: zod_1.z.unknown(), source: zod_1.z.string().min(1).max(100) }).strict().parse(body);
        await this.authLimit(input.source);
        return this.services.auth.register(input.credentials);
    }
    async login(key, body) {
        secret(key, process.env.BRIDGE_KEY);
        const input = zod_1.z.object({ credentials: zod_1.z.unknown(), source: zod_1.z.string().min(1).max(100) }).strict().parse(body);
        await this.authLimit(input.source);
        return this.services.auth.login(input.credentials);
    }
    async authLimit(source) {
        await this.services.limiter.hit(`auth:${(0, crypto_1.createHash)('sha256').update(source).digest('hex')}`, 8, 60000);
        await this.services.limiter.hit('auth:global', 100, 60000);
    }
    async actor(key, token) {
        secret(key, process.env.BRIDGE_KEY);
        const actor = await this.services.auth.actor(token || '');
        await this.services.limiter.hit(`actor:${actor}`, 30, 10000);
        return actor;
    }
    async state(key, token) {
        return this.services.game.state(await this.actor(key, token));
    }
    async action(key, token, body) {
        const actor = await this.actor(key, token);
        const input = zod_1.z.object({ action: zod_1.z.unknown(), world: zod_1.z.unknown() }).strict().parse(body);
        return this.services.game.execute(actor, input.action, input.world);
    }
    async logout(key, token) {
        secret(key, process.env.BRIDGE_KEY);
        await this.services.auth.logout(token || '');
        return { ok: true };
    }
    async overview(key) {
        secret(key, process.env.ADMIN_KEY);
        const db = this.services.db;
        return {
            characters: await db('characters').count({ count: '*' }).first(),
            supply: await db('characters').sum({ cash: 'cash', bank: 'bank' }).first(),
            orders: await db('orders').select('status').count({ count: '*' }).groupBy('status'),
            recent: await db('ledger').orderBy('id', 'desc').limit(30),
        };
    }
    async character(key, id) {
        secret(key, process.env.ADMIN_KEY);
        const actor = zod_1.z.coerce.number().int().positive().parse(id);
        return { state: await this.services.game.state(actor), items: await this.services.db('item_log').where({ character_id: actor }).orderBy('id', 'desc').limit(30) };
    }
};
exports.ApiController = ApiController;
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ApiController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('bridge/register'),
    __param(0, (0, common_1.Headers)('x-bridge-key')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ApiController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('bridge/login'),
    __param(0, (0, common_1.Headers)('x-bridge-key')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ApiController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('bridge/state'),
    __param(0, (0, common_1.Headers)('x-bridge-key')),
    __param(1, (0, common_1.Headers)('x-session')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ApiController.prototype, "state", null);
__decorate([
    (0, common_1.Post)('bridge/action'),
    __param(0, (0, common_1.Headers)('x-bridge-key')),
    __param(1, (0, common_1.Headers)('x-session')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ApiController.prototype, "action", null);
__decorate([
    (0, common_1.Post)('bridge/logout'),
    __param(0, (0, common_1.Headers)('x-bridge-key')),
    __param(1, (0, common_1.Headers)('x-session')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ApiController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('admin/overview'),
    __param(0, (0, common_1.Headers)('x-admin-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ApiController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('admin/character'),
    __param(0, (0, common_1.Headers)('x-admin-key')),
    __param(1, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ApiController.prototype, "character", null);
exports.ApiController = ApiController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [Services])
], ApiController);
let ApiErrors = class ApiErrors {
    catch(exception, host) {
        const status = exception instanceof validation_1.GameError ? exception.status : exception instanceof zod_1.ZodError ? 400 : exception?.getStatus?.() || 500;
        if (status >= 500)
            console.error('[api]', exception?.code || exception?.name || 'Error');
        host.switchToHttp().getResponse().status(status).json({ error: status >= 500 ? 'Сервис временно недоступен' : exception instanceof zod_1.ZodError ? 'Проверьте поля запроса' : exception.message, status });
    }
};
exports.ApiErrors = ApiErrors;
exports.ApiErrors = ApiErrors = __decorate([
    (0, common_1.Catch)()
], ApiErrors);
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({ controllers: [ApiController], providers: [Services] })
], AppModule);
//# sourceMappingURL=app.js.map