import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
const input=process.argv[2];
if(!input) throw new Error('Usage: npm run install:rage -- "C:\\RAGEMP\\server-files"');
const target=path.resolve(input);
if(!existsSync(path.join(target,'ragemp-server.exe'))&&!existsSync(path.join(target,'ragemp-server'))) throw new Error('Target must contain the official RAGE MP server binary');
if(!existsSync('release/ragemp/packages/citycore/index.js')||!existsSync('release/ragemp/client_packages/citycore/ui/index.html')) throw new Error('Run npm run build first');
if(!existsSync('ragemp/server-config.json')) throw new Error('Run npm run setup first');
for(const dir of ['packages','client_packages']) {
  const destination=path.join(target,dir,'citycore');
  if(existsSync(destination)) cpSync(destination,path.join(target,'citycore-backups',String(Date.now()),dir,'citycore'),{recursive:true});
  mkdirSync(destination,{recursive:true});
  cpSync(path.join('release/ragemp',dir,'citycore'),destination,{recursive:true});
}
copyFileSync('ragemp/server-config.json',path.join(target,'packages/citycore/server-config.json'));
const entry=path.join(target,'client_packages/index.js');
const existing=existsSync(entry)?readFileSync(entry,'utf8'):'';
if(!existing.includes("require('./citycore/index.js')")&&!existing.includes('require("./citycore/index.js")')) {
  if(existsSync(entry)) copyFileSync(entry,`${entry}.backup-${Date.now()}`);
  writeFileSync(entry,`${existing}\nrequire('./citycore/index.js');\n`);
}
const conf=path.join(target,'conf.json');
if(!existsSync(conf)) copyFileSync('ragemp/conf.example.json',conf);
console.log(`Installed into ${target}. Existing conf.json preserved. Ensure enable-nodejs=true and restart the RAGE MP server.`);
