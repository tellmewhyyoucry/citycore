"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Limiter = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const validation_1 = require("../core/validation");
/** Redis failures fail closed; local mode is explicit and suitable for one backend process. */
class Limiter {
    redis;
    local = new Map();
    constructor(url = process.env.REDIS_URL) { if (url)
        this.redis = new ioredis_1.default(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false }); }
    async init() { if (this.redis) {
        this.redis.on('error', () => { });
        await this.redis.connect();
    } }
    async hit(key, max, ms) {
        let count;
        if (this.redis) {
            count = Number(await this.redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n", 1, `citycore:limit:${key}`, ms));
        }
        else {
            const now = Date.now();
            if (this.local.size > 1000)
                for (const [k, v] of this.local)
                    if (v.expires <= now)
                        this.local.delete(k);
            const value = this.local.get(key);
            if (!value || value.expires <= now) {
                this.local.set(key, { count: 1, expires: now + ms });
                count = 1;
            }
            else
                count = ++value.count;
        }
        if (count > max)
            throw new validation_1.GameError('Слишком много запросов. Подождите', 429);
    }
    async close() { if (this.redis)
        this.redis.disconnect(); }
}
exports.Limiter = Limiter;
//# sourceMappingURL=limiter.js.map