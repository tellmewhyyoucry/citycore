import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../src/infra/database';
import { migrate } from '../src/infra/migrate';
import { AuthService } from '../src/core/auth';
import { GameService } from '../src/core/game';
import { DESTINATIONS, LOCATIONS, World, ActionType } from '../shared/game';
const name = process.env.TEST_DB_NAME;
if (!name || !/^[a-zA-Z0-9_]+_test$/.test(name)) throw new Error('Set TEST_DB_NAME ending in _test. Integration tests never use DB_NAME.');
const db = connectDatabase(name), auth = new AuthService(db), game = new GameService(db);
const world = (point = LOCATIONS.bank, ownVehicle = true): World => ({ position: { x:point.x, y:point.y, z:point.z }, health: 70, ownVehicle, dimension: 0 });
const action = (type: ActionType, fields = {}) => ({ id: randomUUID(), type, ...fields });
async function account() { const username = `t_${randomUUID().replace(/-/g, '').slice(0,18)}`, password = 'integration-password'; await auth.register({ username, password }); return { ...(await auth.login({ username, password })), username, password }; }
async function funded() { const a = await account(); await game.execute(a.actor, action('bank.deposit', { amount: 500 }), world()); return a; }
before(async () => { await migrate(db); });
after(async () => { await db.destroy(); });
test('same simultaneous deposit request commits once', async () => {
  const a = await account(), request = action('bank.deposit', { amount: 100 });
  const results = await Promise.all(Array.from({ length: 12 }, () => game.execute(a.actor, request, world())));
  assert.equal(results.filter(r => !r.replay).length, 1);
  const s = await game.state(a.actor); assert.equal(s.character.cash, 900); assert.equal(s.character.bank, 100);
  assert.equal((await db('ledger').where({ character_id:a.actor, kind:'bank.deposit' })).length, 1);
});
test('opposite transfers avoid deadlocks and conserve money', async () => {
  const a = await funded(), b = await funded();
  await Promise.all(Array.from({ length: 30 }, (_, i) => game.execute(i % 2 ? a.actor : b.actor, action('bank.transfer', { targetId: i % 2 ? b.actor : a.actor, amount: 10 }), world())));
  assert.equal((await game.state(a.actor)).character.bank, 500); assert.equal((await game.state(b.actor)).character.bank, 500);
});
test('concurrent overspend permits only available balance', async () => {
  const a = await funded(), b = await funded();
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => game.execute(a.actor, action('bank.transfer', { targetId:b.actor, amount:300 }), world())));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await game.state(a.actor)).character.bank, 200); assert.equal((await game.state(b.actor)).character.bank, 800);
});
test('recipient limit rolls back sender debit and ledger', async () => {
  const a = await funded(), b = await funded(); await db('characters').where({ id:b.actor }).update({ bank:1_000_000_000 });
  const request = action('bank.transfer', { targetId:b.actor, amount:1 });
  await assert.rejects(game.execute(a.actor, request, world()));
  assert.equal((await game.state(a.actor)).character.bank, 500);
  assert.equal((await db('ledger').where({ request_id:request.id })).length, 0);
});
test('request ID cannot be reused with changed payload', async () => {
  const a = await account(), request = action('bank.deposit', { amount:100 });
  await game.execute(a.actor, request, world());
  await assert.rejects(game.execute(a.actor, { ...request, amount:200 }, world()));
});
test('last item cannot be duplicated between two simultaneous recipients', async () => {
  const a = await account(), b = await account(), c = await account();
  await game.execute(a.actor, action('shop.buy', { item:'water', quantity:1 }), world(LOCATIONS.shop));
  const results = await Promise.allSettled([b,c].map(target => game.execute(a.actor, action('inventory.give', { item:'water', quantity:1, targetId:target.actor }), { ...world(), target:{ id:target.actor, position:LOCATIONS.bank, dimension:0 } })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rows = await db('inventory').whereIn('character_id', [a.actor,b.actor,c.actor]); assert.equal(rows.reduce((s,r)=>s+r.quantity,0),1);
});
test('full recipient inventory rolls back item removal', async () => {
  const a = await account(), b = await account();
  await game.execute(a.actor, action('shop.buy', { item:'water',quantity:1 }), world(LOCATIONS.shop));
  await game.execute(b.actor, action('shop.buy', { item:'water',quantity:20 }), world(LOCATIONS.shop));
  await assert.rejects(game.execute(a.actor, action('inventory.give', { item:'water',quantity:1,targetId:b.actor }), { ...world(), target:{ id:b.actor,position:LOCATIONS.bank,dimension:0 } }));
  assert.equal((await game.state(a.actor)).inventory[0].quantity,1);
});
test('overweight purchase rolls back debit', async () => {
  const a = await account(); await db('characters').where({ id:a.actor }).update({ cash:100000 });
  for (const [item,quantity] of [['water',20],['sandwich',20],['toolkit',1]] as const) await game.execute(a.actor, action('shop.buy',{item,quantity}), world(LOCATIONS.shop));
  const before = (await game.state(a.actor)).character.cash;
  await assert.rejects(game.execute(a.actor, action('shop.buy',{item:'medkit',quantity:1}), world(LOCATIONS.shop)));
  assert.equal((await game.state(a.actor)).character.cash,before);
});
test('sell and consume persist quantities, cash and hunger', async () => {
  const a = await account(); await game.execute(a.actor, action('shop.buy',{item:'sandwich',quantity:3}), world(LOCATIONS.shop));
  await game.execute(a.actor, action('inventory.use',{item:'sandwich'}), world());
  await game.execute(a.actor, action('shop.sell',{item:'sandwich',quantity:1}), world(LOCATIONS.shop));
  const s=await game.state(a.actor); assert.equal(s.character.hunger,90); assert.equal(s.character.cash,785); assert.equal(s.inventory[0].quantity,1);
});
test('courier cannot pay early, remotely, or without own vehicle; duplicate completion pays once', async () => {
  const a = await account(); await game.execute(a.actor, action('courier.start'), world(LOCATIONS.depot,false));
  await assert.rejects(game.execute(a.actor, action('courier.deliver'), world(LOCATIONS.depot)));
  await game.execute(a.actor, action('courier.pickup'), world(LOCATIONS.depot));
  const order=(await game.state(a.actor)).order!;
  await assert.rejects(game.execute(a.actor, action('courier.deliver'), world(DESTINATIONS[order.destination])));
  await db('orders').where({id:order.id}).update({picked_at:Date.now()-30000});
  await assert.rejects(game.execute(a.actor, action('courier.deliver'), world(LOCATIONS.depot)));
  await assert.rejects(game.execute(a.actor, action('courier.deliver'), world(DESTINATIONS[order.destination],false)));
  const request=action('courier.deliver');
  await Promise.all([game.execute(a.actor,request,world(DESTINATIONS[order.destination])),game.execute(a.actor,request,world(DESTINATIONS[order.destination]))]);
  await assert.rejects(game.execute(a.actor,action('courier.deliver'),world(DESTINATIONS[order.destination])));
  const s=await game.state(a.actor); assert.equal(s.character.bank,500); assert.equal(s.character.xp,25); assert.equal(s.order,null); assert.equal(s.character.on_shift,1);
});
test('logout and reconnect cancel unfinished shift without payment, persist inventory and invalidate old session', async () => {
  const a=await funded(); await game.execute(a.actor,action('shop.buy',{item:'water',quantity:2}),world(LOCATIONS.shop));
  await game.execute(a.actor,action('courier.start'),world(LOCATIONS.depot));
  await auth.logout(a.token); await assert.rejects(auth.actor(a.token));
  const fresh=await auth.login({username:a.username,password:a.password}); const s=await game.state(fresh.actor);
  assert.equal(s.character.bank,500); assert.equal(s.inventory[0].quantity,2); assert.equal(s.character.on_shift,0); assert.equal(s.order,null);
});
test('new login invalidates previous session', async () => {
  const a=await account(); const fresh=await auth.login({username:a.username,password:a.password});
  await assert.rejects(auth.actor(a.token)); assert.equal(await auth.actor(fresh.token),a.actor);
});
test('distance, dimensions, unknown target and unaffordable purchases are rejected', async () => {
  const a=await account(), b=await account();
  await assert.rejects(game.execute(a.actor,action('bank.deposit',{amount:1}),world(LOCATIONS.depot)));
  await assert.rejects(game.execute(a.actor,action('bank.deposit',{amount:1}),{...world(),dimension:1}));
  await assert.rejects(game.execute(a.actor,action('bank.transfer',{amount:1,targetId:2147483647}),world()));
  await assert.rejects(game.execute(a.actor,action('shop.buy',{item:'toolkit',quantity:2}),world(LOCATIONS.shop)));
  await assert.rejects(game.execute(a.actor,action('inventory.give',{item:'water',quantity:1,targetId:b.actor}),{...world(),target:{id:b.actor,position:LOCATIONS.bank,dimension:1}}));
});
test('medkit consumes once and does not replay GTA health effect', async () => {
  const a=await account(); await game.execute(a.actor,action('shop.buy',{item:'medkit',quantity:1}),world(LOCATIONS.shop));
  const request=action('inventory.use',{item:'medkit'});
  assert.equal((await game.execute(a.actor,request,world())).healTo,100);
  assert.equal((await game.execute(a.actor,request,world())).healTo,undefined);
  assert.equal((await game.state(a.actor)).inventory.length,0);
});
test('state survives a fresh database connection and migration is repeatable', async () => {
  const a=await funded(); await migrate(db); const fresh=connectDatabase(name);
  try { assert.equal((await new GameService(fresh).state(a.actor)).character.bank,500); } finally { await fresh.destroy(); }
});
