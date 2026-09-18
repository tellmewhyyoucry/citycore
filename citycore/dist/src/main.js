"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
require("dotenv/config");
const core_1 = require("@nestjs/core");
const app_1 = require("./api/app");
async function main() {
    for (const key of ['BRIDGE_KEY', 'ADMIN_KEY', 'DB_PASSWORD'])
        if (!process.env[key] || (key !== 'DB_PASSWORD' && process.env[key].length < 32))
            throw new Error(`Configure ${key} in .env: npm run setup`);
    if (process.env.ADMIN_KEY === process.env.BRIDGE_KEY)
        throw new Error('Use different ADMIN_KEY and BRIDGE_KEY');
    const app = await core_1.NestFactory.create(app_1.AppModule);
    app.useGlobalFilters(new app_1.ApiErrors());
    app.enableShutdownHooks();
    await app.listen(Number(process.env.API_PORT || 3100), process.env.API_HOST || '127.0.0.1');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
//# sourceMappingURL=main.js.map