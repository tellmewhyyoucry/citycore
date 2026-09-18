import 'dotenv/config';
import knex, { Knex } from 'knex';
export function connectDatabase(database = process.env.DB_NAME || 'citycore') : Knex {
  return knex({ client: 'mysql2', connection: {
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'citycore', password: process.env.DB_PASSWORD, database,
    charset: 'utf8mb4', supportBigNumbers: true, bigNumberStrings: false,
  }, pool: { min: 0, max: 10 }, acquireConnectionTimeout: 10000 });
}
