"use strict";
(() => {
  // shared/game.ts
  var LOCATIONS = {
    depot: { x: 78.9, y: 111.8, z: 81.2 },
    vehicle: { x: 70.1, y: 118.8, z: 79.1 },
    bank: { x: 150.1, y: -1040.5, z: 29.4 },
    shop: { x: 25.7, y: -1346.7, z: 29.5 }
  };
  var DESTINATIONS = [
    { name: "Vespucci", x: -1213.1, y: -406.4, z: 34.1 },
    { name: "Mirror Park", x: 1165.1, y: -323.7, z: 69.2 },
    { name: "Rockford Hills", x: -709.7, y: -904.1, z: 19.2 }
  ];
  var RULES = { maxWeight: 2e4, slots: 8, maxMoney: 1e9, salary: 500, xp: 25, minDeliveryMs: 2e4, jobTtlMs: 30 * 6e4 };

  // ragemp/client/index.ts
  var browser;
  var ready = false;
  var opened = false;
  var authenticated = false;
  var route;
  var marker;
  var cachedState;
  var queued = [];
  function open(value) {
    opened = value;
    mp.gui.cursor.show(value, value);
    mp.gui.chat.activate(!value);
    if (browser && ready) browser.execute(`window.cityVisible(${value})`);
  }
  function routeTo(state) {
    var _a;
    if (route) {
      route.destroy();
      route = void 0;
    }
    if (marker) {
      marker.destroy();
      marker = void 0;
    }
    if (!state.character.on_shift) return;
    const point = ((_a = state.order) == null ? void 0 : _a.status) === "picked" ? DESTINATIONS[state.order.destination] : LOCATIONS.depot;
    route = mp.blips.new(1, new mp.Vector3(point.x, point.y, point.z), { color: 2, name: "\u0417\u0430\u043A\u0430\u0437 CityCore", shortRange: false });
    route.setRoute(true);
    route.setRouteColour(2);
    marker = mp.markers.new(1, new mp.Vector3(point.x, point.y, point.z - 1), 2, { color: [112, 255, 183, 130] });
  }
  mp.events.add("playerReady", () => {
    browser = mp.browsers.new("package://citycore/ui/index.html");
  });
  mp.events.add("city:uiReady", () => {
    ready = true;
    if (browser) for (const payload of queued.splice(0)) browser.execute(`window.cityReceive(${JSON.stringify(payload)})`);
    open(true);
    mp.events.callRemote("city:ready");
  });
  mp.events.add("city:uiRequest", (raw) => {
    if (typeof raw === "string" && raw.length <= 4096) mp.events.callRemote("city:request", raw);
  });
  mp.events.add("city:uiClose", () => {
    if (authenticated) open(false);
  });
  mp.events.add("city:authenticated", () => {
    authenticated = true;
    mp.players.local.freezePosition(false);
  });
  mp.events.add("city:response", (raw) => {
    try {
      const payload = JSON.parse(raw);
      if (payload.kind === "authRequired") {
        authenticated = false;
        cachedState = void 0;
        if (route) {
          route.destroy();
          route = void 0;
        }
        if (marker) {
          marker.destroy();
          marker = void 0;
        }
        open(true);
      }
      if (payload.kind === "state") {
        cachedState = payload.state;
        routeTo(payload.state);
      }
      if (browser && ready) browser.execute(`window.cityReceive(${JSON.stringify(raw)})`);
      else if (queued.length < 20) queued.push(raw);
    } catch {
    }
  });
  mp.keys.bind(113, true, () => open(authenticated ? !opened : true));
  mp.keys.bind(27, true, () => {
    if (authenticated && opened) open(false);
  });
  mp.events.add("render", () => {
    if (!authenticated) mp.players.local.freezePosition(true);
    if (opened) {
      mp.game.controls.disableAllControlActions(0);
    } else if (authenticated) {
      mp.game.graphics.drawText("CITYCORE  \xB7  F2 \u2014 \u043C\u0435\u043D\u044E", [0.02, 0.94], { font: 4, color: [160, 255, 200, 220], scale: [0.38, 0.38], outline: true });
    }
  });
})();
//# sourceMappingURL=index.js.map
