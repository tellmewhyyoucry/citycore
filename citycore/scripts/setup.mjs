import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
if (!existsSync('.env')) {
  let content=readFileSync('.env.example','utf8');
  for(const key of ['DB_PASSWORD','DB_ROOT_PASSWORD','BRIDGE_KEY','ADMIN_KEY']) content=content.replace(`${key}=GENERATE_WITH_NPM_RUN_SETUP`,`${key}=${randomBytes(32).toString('hex')}`);
  writeFileSync('.env',content,{mode:0o600}); console.log('Created .env');
} else console.log('Existing .env preserved');
const env=dotenv.parse(readFileSync('.env'));
const target='ragemp/server-config.json';
if (!existsSync(target)) {
  writeFileSync(target,JSON.stringify({apiUrl:`http://127.0.0.1:${env.API_PORT||3100}`,bridgeKey:env.BRIDGE_KEY},null,2)+'\n',{mode:0o600});
  console.log('Created private RAGE server configuration');
} else console.log('Existing RAGE server configuration preserved');
console.log('For existing MariaDB edit DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD in .env. Never put secrets in client_packages.');
