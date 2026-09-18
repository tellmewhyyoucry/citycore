import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { cpus, platform } from 'node:os';
import { connectDatabase } from '../src/infra/database';
import { migrate } from '../src/infra/migrate';
import { AuthService } from '../src/core/auth';
import { GameService } from '../src/core/game';
import { LOCATIONS } from '../shared/game';
async function main() {
  const name=process.env.TEST_DB_NAME;
  if (!name || !/^[a-zA-Z0-9_]+_test$/.test(name)) throw new Error('Set a dedicated TEST_DB_NAME ending in _test');
  const db=connectDatabase(name), game=new GameService(db), auth=new AuthService(db);
  const workers=10, perWorker=100, latencies:number[]=[]; let errors=0;
  const world={position:LOCATIONS.bank,dimension:0,health:100,ownVehicle:false};
  try {
    await migrate(db); const pairs:number[][]=[];
    for(let i=0;i<workers;i++) { const pair:number[]=[]; for(let j=0;j<2;j++) { const c={username:`b_${randomUUID().replace(/-/g,'').slice(0,18)}`,password:'benchmark-password'}; await auth.register(c); const a=await auth.login(c); await game.execute(a.actor,{id:randomUUID(),type:'bank.deposit',amount:500},world); pair.push(a.actor); } pairs.push(pair); }
    const started=performance.now();
    await Promise.all(pairs.map(async pair=>{for(let i=0;i<perWorker;i++){const t=performance.now();try{await game.execute(pair[i%2],{id:randomUUID(),type:'bank.transfer',targetId:pair[1-i%2],amount:1},world);}catch{errors++;}latencies.push(performance.now()-t);}}));
    const elapsed=performance.now()-started; latencies.sort((a,b)=>a-b);
    const rows=await db('characters').whereIn('id',pairs.flat());
    const conserved=rows.every(r=>r.bank===500&&r.cash===500);
    const [version]=await db.raw('SELECT VERSION() AS version');
    const report={scope:'GameService + Knex + MariaDB; excludes HTTP, RAGE MP, GTA clients and authentication',date:new Date().toISOString(),node:process.version,os:platform(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,mariadb:version[0].version,workers,requests:latencies.length,errors,conserved,elapsedMs:Math.round(elapsed),throughput:Math.round(latencies.length/(elapsed/1000)),p50Ms:+latencies[Math.floor(latencies.length*.5)].toFixed(2),p95Ms:+latencies[Math.floor(latencies.length*.95)].toFixed(2),p99Ms:+latencies[Math.floor(latencies.length*.99)].toFixed(2)};
    writeFileSync('docs/benchmark.json',JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2));
    if(errors||!conserved) process.exitCode=1;
  } finally {await db.destroy();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
