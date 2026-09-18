import { randomBytes } from 'crypto';
import { api } from './http';
import { ACTIONS, Action, ActionResult, GameState, LOCATIONS, World } from '../../shared/game';
const uuid = () => { const b = randomBytes(16); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = b.toString('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; };
type Session = { token?: string; actor?: number; vehicle?: VehicleMp; state?: GameState; closed: boolean; busy: boolean; last: number };
const sessions = new Map<PlayerMp, Session>();
function alive(p: PlayerMp, s: Session) { return !s.closed && mp.players.exists(p) && sessions.get(p) === s; }
function send(p: PlayerMp, s: Session, payload: unknown) { if (alive(p, s)) p.call('city:response', [JSON.stringify(payload)]); }
function destroyVehicle(s: Session) { const v = s.vehicle; s.vehicle = undefined; if (v && mp.vehicles.exists(v)) v.destroy(); }
function snapshot(p: PlayerMp, s: Session, targetId?: number): World {
  let target: World['target'];
  if (targetId) for (const [other, entry] of sessions) if (entry.actor === targetId && alive(other, entry) && entry.token) target = { id: targetId, position: { x:other.position.x,y:other.position.y,z:other.position.z }, dimension: other.dimension };
  return { position: { x:p.position.x,y:p.position.y,z:p.position.z }, dimension: p.dimension, health: Math.max(0, Math.min(100, p.health)), ownVehicle: !!s.vehicle && mp.vehicles.exists(s.vehicle) && p.vehicle === s.vehicle && s.vehicle.engineHealth > 0, ...(target ? { target } : {}) };
}
async function refresh(p: PlayerMp, s: Session) {
  const state = await api<GameState>('/bridge/state', {}, s.token);
  if (!alive(p, s)) return;
  s.state = state;
  if (!state.character.on_shift) destroyVehicle(s);
  send(p, s, { kind: 'state', state });
}
async function cancel(p: PlayerMp, s: Session) {
  destroyVehicle(s);
  if (s.token && alive(p, s)) {
    await api('/bridge/action', { action: { id: uuid(), type: 'courier.cancel' }, world: snapshot(p, s) }, s.token);
    await refresh(p, s);
  }
}
mp.events.add('playerJoin', (p: PlayerMp) => {
  const s: Session = { closed: false, busy: false, last: 0 }; sessions.set(p, s);
  p.model = mp.joaat('mp_m_freemode_01');
  p.dimension = p.id + 1000; p.spawn(new mp.Vector3(LOCATIONS.depot.x, LOCATIONS.depot.y, LOCATIONS.depot.z));
});
mp.events.add('city:ready', (p: PlayerMp) => {
  const s = sessions.get(p); if (!s) return;
  send(p, s, { kind: 'authRequired' });
});
mp.events.add('city:request', async (p: PlayerMp, raw: unknown) => {
  const s = sessions.get(p); if (!s || !alive(p, s)) return;
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 4096) return;
  // Bound both frequency and concurrency before parsing or doing database work.
  if (s.busy || Date.now() - s.last < 200) { send(p, s, { kind: 'error', message: 'Подождите завершения запроса' }); return; }
  s.busy = true; s.last = Date.now();
  let requestId: string | undefined;
  try {
    const request = JSON.parse(raw);
    requestId = typeof request.id === 'string' ? request.id.slice(0, 36) : undefined;
    if (request.kind === 'login' || request.kind === 'register') {
      if (s.token) throw new Error('Вы уже вошли');
      const result = await api(`/bridge/${request.kind}`, { credentials: { username: request.username, password: request.password }, source: p.ip });
      if (!alive(p, s)) { if (result.token) await api('/bridge/logout', {}, result.token); return; }
      if (request.kind === 'register') send(p, s, { kind: 'ok', message: result.message, requestId });
      else {
        // Invalidate any older game connection for this character as well as the DB session.
        for (const [other, entry] of sessions) if (other !== p && entry.actor === result.actor) { destroyVehicle(entry); entry.token = undefined; other.kick('Аккаунт открыт в другом соединении'); }
        s.token = result.token; s.actor = result.actor;
        p.dimension = 0; p.health = 100;
        p.spawn(new mp.Vector3(LOCATIONS.depot.x, LOCATIONS.depot.y, LOCATIONS.depot.z));
        p.call('city:authenticated');
        await refresh(p, s); send(p, s, { kind: 'ok', message: 'Добро пожаловать в CityCore', requestId });
      }
    } else {
      if (!s.token) throw new Error('Сначала войдите');
      if (request.kind === 'state') { await refresh(p, s); send(p, s, { kind: 'ok', message: 'Данные обновлены', requestId }); }
      else if (request.kind === 'action') {
        // Forward only action fields. Identity, position, health and vehicle ownership come from this adapter.
        const a = request.action as Action;
        if (!a || !ACTIONS.includes(a.type)) throw new Error('Неизвестное действие');
        requestId = typeof a.id === 'string' ? a.id.slice(0, 36) : undefined;
        const result = await api<ActionResult>('/bridge/action', { action: a, world: snapshot(p, s, a.targetId) }, s.token);
        if (!alive(p, s)) return;
        if (a.type === 'courier.start' && (!s.vehicle || !mp.vehicles.exists(s.vehicle))) {
          // Reconcile against current state on retry; an old receipt must never respawn a finished shift.
          await refresh(p, s);
          if (s.state?.character.on_shift) {
            try {
              const pos = LOCATIONS.vehicle;
              s.vehicle = mp.vehicles.new(mp.joaat('speedo'), new mp.Vector3(pos.x, pos.y, pos.z), { heading: 160, numberPlate: `CC${s.actor}`, engine: true, dimension: 0 });
              p.putIntoVehicle(s.vehicle, 0);
            } catch { await cancel(p, s); throw new Error('Не удалось выдать транспорт. Смена отменена'); }
          }
        }
        if (result.healTo !== undefined && !result.replay && p.health > 0) p.health = Math.max(p.health, result.healTo);
        if (a.type === 'courier.cancel') destroyVehicle(s);
        await refresh(p, s);
        send(p, s, { kind: 'ok', message: result.message, requestId, replay: !!result.replay });
        if (a.targetId) for (const [other, entry] of sessions) if (entry.actor === a.targetId && alive(other, entry)) send(other, entry, { kind: 'notice', message: 'Поступили деньги или предметы. Нажмите «Обновить»' });
      } else throw new Error('Неизвестный запрос');
    }
  } catch (error: any) {
    if (error.status === 401 && s.token) { s.token = undefined; destroyVehicle(s); send(p, s, { kind: 'authRequired' }); }
    send(p, s, { kind: 'error', message: error.message || 'Ошибка соединения', requestId });
  } finally {
    s.busy = false;
    if (s.closed && s.token) { const token = s.token; s.token = undefined; api('/bridge/logout', {}, token).catch(() => console.error('[citycore] Deferred logout failed; next login resets shift')); }
  }
});
mp.events.add('playerQuit', (p: PlayerMp) => {
  const s = sessions.get(p); if (!s) return;
  s.closed = true; destroyVehicle(s); sessions.delete(p);
  if (!s.busy && s.token) api('/bridge/logout', {}, s.token).catch(() => console.error('[citycore] Logout failed; next login resets shift'));
});
mp.events.add('playerDeath', (p: PlayerMp) => {
  const s = sessions.get(p); if (!s) return;
  destroyVehicle(s);
  setTimeout(() => { if (alive(p, s)) { p.spawn(new mp.Vector3(LOCATIONS.depot.x, LOCATIONS.depot.y, LOCATIONS.depot.z)); p.health = 100; } }, 4000);
});
mp.events.add('playerEnterVehicle', (p: PlayerMp, vehicle: VehicleMp) => {
  for (const [owner, s] of sessions) if (s.vehicle === vehicle && owner !== p) p.removeFromVehicle();
});
// Reconcile lost/dead transport and death after any in-flight action completes.
setInterval(() => {
  for (const [p, s] of sessions) {
    if (!s.token || s.busy || !alive(p, s) || !s.state?.character.on_shift) continue;
    if (!s.vehicle || !mp.vehicles.exists(s.vehicle) || s.vehicle.engineHealth <= 0) {
      s.busy = true; cancel(p, s).catch(() => send(p, s, { kind: 'notice', message: 'Не удалось отменить смену. Повторная попытка через 5 секунд' })).finally(() => { s.busy = false; });
    }
  }
}, 5000);
for (const [name, pos] of Object.entries(LOCATIONS)) {
  if (name === 'vehicle') continue;
  mp.markers.new(1, new mp.Vector3(pos.x, pos.y, pos.z - 1), 1.3, { color: [112, 255, 183, 130], dimension: 0 });
  mp.blips.new(name === 'bank' ? 108 : name === 'shop' ? 52 : 478, new mp.Vector3(pos.x, pos.y, pos.z), { name: name === 'bank' ? 'CityCore Bank' : name === 'shop' ? 'CityCore Market' : 'CityCore Delivery', color: 2, shortRange: true, dimension: 0 });
}
console.log(`[citycore] RAGE adapter ready (Node ${process.version}). API must be running separately.`);
