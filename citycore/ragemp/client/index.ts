import { DESTINATIONS, GameState, LOCATIONS } from '../../shared/game';
let browser: BrowserMp | undefined;
let ready = false, opened = false, authenticated = false;
let route: BlipMp | undefined, marker: MarkerMp | undefined;
let cachedState: GameState | undefined;
const queued: string[] = [];
function open(value: boolean) {
  opened = value; mp.gui.cursor.show(value, value); mp.gui.chat.activate(!value);
  if (browser && ready) browser.execute(`window.cityVisible(${value})`);
}
function routeTo(state: GameState) {
  if (route) { route.destroy(); route = undefined; }
  if (marker) { marker.destroy(); marker = undefined; }
  if (!state.character.on_shift) return;
  const point = state.order?.status === 'picked' ? DESTINATIONS[state.order.destination] : LOCATIONS.depot;
  route = mp.blips.new(1, new mp.Vector3(point.x, point.y, point.z), { color: 2, name: 'Заказ CityCore', shortRange: false });
  route.setRoute(true); route.setRouteColour(2);
  marker = mp.markers.new(1, new mp.Vector3(point.x, point.y, point.z - 1), 2, { color: [112, 255, 183, 130] });
}
mp.events.add('playerReady', () => { browser = mp.browsers.new('package://citycore/ui/index.html'); });
mp.events.add('city:uiReady', () => {
  ready = true;
  if (browser) for (const payload of queued.splice(0)) browser.execute(`window.cityReceive(${JSON.stringify(payload)})`);
  open(true); mp.events.callRemote('city:ready');
});
mp.events.add('city:uiRequest', (raw: string) => { if (typeof raw === 'string' && raw.length <= 4096) mp.events.callRemote('city:request', raw); });
mp.events.add('city:uiClose', () => { if (authenticated) open(false); });
mp.events.add('city:authenticated', () => { authenticated = true; mp.players.local.freezePosition(false); });
mp.events.add('city:response', (raw: string) => {
  try {
    const payload = JSON.parse(raw);
    if (payload.kind === 'authRequired') { authenticated = false; cachedState = undefined; if (route) { route.destroy(); route = undefined; } if (marker) { marker.destroy(); marker = undefined; } open(true); }
    if (payload.kind === 'state') { cachedState = payload.state; routeTo(payload.state); }
    if (browser && ready) browser.execute(`window.cityReceive(${JSON.stringify(raw)})`);
    else if (queued.length < 20) queued.push(raw);
  } catch { /* Ignore malformed local UI payloads. */ }
});
mp.keys.bind(0x71, true, () => open(authenticated ? !opened : true)); // F2
mp.keys.bind(0x1B, true, () => { if (authenticated && opened) open(false); });
mp.events.add('render', () => {
  if (!authenticated) mp.players.local.freezePosition(true);
  if (opened) { mp.game.controls.disableAllControlActions(0); }
  else if (authenticated) {
    mp.game.graphics.drawText('CITYCORE  ·  F2 — меню', [0.02, 0.94], { font: 4, color: [160, 255, 200, 220], scale: [0.38, 0.38], outline: true });
  }
});
