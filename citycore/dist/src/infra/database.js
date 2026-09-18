"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDatabase = connectDatabase;
require("dotenv/config");
const knex_1 = __importDefault(require("knex"));
function connectDatabase(database = process.env.DB_NAME || 'citycore') {
    return (0, knex_1.default)({ client: 'mysql2', connection: {
            host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER || 'citycore', password: process.env.DB_PASSWORD, database,
            charset: 'utf8mb4', supportBigNumbers: true, bigNumberStrings: false,
        }, pool: { min: 0, max: 10 }, acquireConnectionTimeout: 10000 });
}
//# sourceMappingURL=database.js.map