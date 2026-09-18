"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ragemp/server/index.ts
var import_crypto = require("crypto");

// ragemp/server/http.ts
var import_http = __toESM(require("http"));
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var config = JSON.parse(import_fs.default.readFileSync(import_path.default.join(__dirname, "server-config.json"), "utf8"));
var base = new URL(config.apiUrl);
if (base.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error("Bridge requires a loopback HTTP API; use a secure tunnel for remote services");
if (typeof config.bridgeKey !== "string" || config.bridgeKey.length < 32) throw new Error("Missing bridgeKey");
function api(endpoint, body = {}, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = import_http.default.request(new URL(endpoint, base), { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), "x-bridge-key": config.bridgeKey, "x-session": token || "" } }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        text += chunk;
        if (text.length > 1e5) req.destroy(new Error("API response too large"));
      });
      res.on("error", reject);
      res.on("end", () => {
        try {
          const result = JSON.parse(text);
          if ((res.statusCode || 500) >= 400) {
            const e = new Error(result.error || "\u041E\u0448\u0438\u0431\u043A\u0430 API");
            e.status = res.statusCode;
            reject(e);
          } else resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.setTimeout(8e3, () => req.destroy(new Error("\u0422\u0430\u0439\u043C\u0430\u0443\u0442 \u0441\u0435\u0440\u0432\u0435\u0440\u0430. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0437\u0430\u043F\u0440\u043E\u0441 \u0441 \u0442\u0435\u043C \u0436\u0435 ID")));
    req.on("error", reject);
    req.end(data);
  });
}

// shared/game.ts
var LOCATIONS = {
  depot: { x: 78.9, y: 111.8, z: 81.2 },
  vehicle: { x: 70.1, y: 118.8, z: 79.1 },
  bank: { x: 150.1, y: -1040.5, z: 29.4 },
  shop: { x: 25.7, y: -1346.7, z: 29.5 }
};
var RULES = { maxWeight: 2e4, slots: 8, maxMoney: 1e9, salary: 500, xp: 25, minDeliveryMs: 2e4, jobTtlMs: 30 * 6e4 };
var ACTIONS = ["courier.start", "courier.next", "courier.pickup", "courier.deliver", "courier.cancel", "bank.deposit", "bank.withdraw", "bank.transfer", "shop.buy", "shop.sell", "inventory.give", "inventory.use"];

// ragemp/server/index.ts
var uuid = () => {
  const b = (0, import_crypto.randomBytes)(16);
  b[6] = b[6] & 15 | 64;
  b[8] = b[8] & 63 | 128;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
var sessions = /* @__PURE__ */ new Map();
function alive(p, s) {
  return !s.closed && mp.players.exists(p) && sessions.get(p) === s;
}
function send(p, s, payload) {
  if (alive(p, s)) p.call("city:response", [JSON.stringify(payload)]);
}
function destroyVehicle(s) {
  const v = s.vehicle;
  s.vehicle = void 0;
  if (v && mp.vehicles.exists(v)) v.destroy();
}
function snapshot(p, s, targetId) {
  let target;
  if (targetId) {
    for (const [other, entry] of sessions) if (entry.actor === targetId && alive(other, entry) && entry.token) target = { id: targetId, position: { x: other.position.x, y: other.position.y, z: other.position.z }, dimension: other.dimension };
  }
  return { position: { x: p.position.x, y: p.position.y, z: p.position.z }, dimension: p.dimension, health: Math.max(0, Math.min(100, p.health)), ownVehicle: !!s.vehicle && mp.vehicles.exists(s.vehicle) && p.vehicle === s.vehicle && s.vehicle.engineHealth > 0, ...target ? { target } : {} };
}
async function refresh(p, s) {
  const state = await api("/bridge/state", {}, s.token);
  if (!alive(p, s)) return;
  s.state = state;
  if (!state.character.on_shift) destroyVehicle(s);
  send(p, s, { kind: "state", state });
}
async function cancel(p, s) {
  destroyVehicle(s);
  if (s.token && alive(p, s)) {
    await api("/bridge/action", { action: { id: uuid(), type: "courier.cancel" }, world: snapshot(p, s) }, s.token);
    await refresh(p, s);
  }
}
mp.events.add("playerJoin", (p) => {
  const s = { closed: false, busy: false, last: 0 };
  sessions.set(p, s);
  p.model = mp.joaat("mp_m_freemode_01");
  p.dimension = p.id + 1e3;
  p.spawn(new mp.Vector3(LOCATIONS.depot.x, LOCATIONS.depot.y, LOCATIONS.depot.z));
});
mp.events.add("city:ready", (p) => {
  const s = sessions.get(p);
  if (!s) return;
  send(p, s, { kind: "authRequired" });
});
mp.events.add("city:request", async (p, raw) => {
  var _a;
  const s = sessions.get(p);
  if (!s || !alive(p, s)) return;
  if (typeof raw !== "string" || Buffer.byteLength(raw) > 4096) return;
  if (s.busy || Date.now() - s.last < 200) {
    send(p, s, { kind: "error", message: "\u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u0437\u0430\u043F\u0440\u043E\u0441\u0430" });
    return;
  }
  s.busy = true;
  s.last = Date.now();
  let requestId;
  try {
    const request = JSON.parse(raw);
    requestId = typeof request.id === "string" ? request.id.slice(0, 36) : void 0;
    if (request.kind === "login" || request.kind === "register") {
      if (s.token) throw new Error("\u0412\u044B \u0443\u0436\u0435 \u0432\u043E\u0448\u043B\u0438");
      const result = await api(`/bridge/${request.kind}`, { credentials: { username: request.username, password: request.password }, source: p.ip });
      if (!alive(p, s)) {
        if (result.token) await api("/bridge/logout", {}, result.token);
        return;
      }
      if (request.kind === "register") send(p, s, { kind: "ok", message: result.message, requestId });
      else {
        for (const [other, entry] of sessions) if (other !== p && entry.actor === result.actor) {
          destroyVehicle(entry);
          entry.token = void 0;
          other.kick("\u0410\u043A\u043A\u0430\u0443\u043D\u0442 \u043E\u0442\u043A\u0440\u044B\u0442 \u0432 \u0434\u0440\u0443\u0433\u043E\u043C \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0438");
        }
        s.token = result.token;
        s.actor = result.actor;
        p.dimension = 0;
        p.health = 100;
        p.spawn(new mp.Vector3(LOCATIONS.depot.x, LOCATIONS.depot.y, LOCATIONS.depot.z));
        p.call("city:authenticated");
        await refresh(p, s);
        send(p, s, { kind: "ok", message: "\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 CityCore", requestId });
      }
    } else {
      if (!s.token) throw new Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u043E\u0439\u0434\u0438\u0442\u0435");
      if (request.kind === "state") {
        await refresh(p, s);
        send(p, s, { kind: "ok", message: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u044B", requestId });
      } else if (request.kind === "action") {
        const a = request.action;
        if (!a || !ACTIONS.includes(a.type)) throw new Error("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435");
        requestId = typeof a.id === "string" ? a.id.slice(0, 36) : void 0;
        const result = await api("/bridge/action", { action: a, world: snapshot(p, s, a.targetId) }, s.token);
        if (!alive(p, s)) return;
        if (a.type === "courier.start" && (!s.vehicle || !mp.vehicles.exists(s.vehicle))) {
          await refresh(p, s);
          if ((_a = s.state) == null ? void 0 : _a.character.on_shift) {
            try {
              const pos = LOCATIONS.vehicle;
              s.vehicle = mp.vehicles.new(mp.joaat("speedo"), new mp.Vector3(pos.x, pos.y, pos.z), { heading: 160, numberPlate: `CC${s.actor}`, engine: true, dimension: 0 });
              p.putIntoVehicle(s.vehicle, 0);
            } catch {
              await cancel(p, s);
              throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u044B\u0434\u0430\u0442\u044C \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442. \u0421\u043C\u0435\u043D\u0430 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430");
            }
          }
        }
        if (result.healTo !== void 0 && !result.replay && p.health > 0) p.health = Math.max(p.health, result.healTo);
        if (a.type === "courier.cancel") destroyVehicle(s);
        await refresh(p, s);
        send(p, s, { kind: "ok", message: result.message, requestId, replay: !!result.replay });
        if (a.targetId) {
          for (const [other, entry] of sessions) if (entry.actor === a.targetId && alive(other, entry)) send(other, entry, { kind: "notice", message: "\u041F\u043E\u0441\u0442\u0443\u043F\u0438\u043B\u0438 \u0434\u0435\u043D\u044C\u0433\u0438 \u0438\u043B\u0438 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C\xBB" });
        }
      } else throw new Error("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0437\u0430\u043F\u0440\u043E\u0441");
    }
  } catch (error) {
    if (error.status === 401 && s.token) {
      s.token = void 0;
      destroyVehicle(s);
      send(p, s, { kind: "authRequired" });
    }
    send(p, s, { kind: "error", message: error.message || "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u044F", requestId });
  } finally {
    s.busy = false;
    if (s.closed && s.token) {
      const token = s.token;
      s.token = void 0;
      api("/bridge/logout", {}, token).catch(() => console.error("[citycore] Deferred logout failed; next login resets shift"));
    }
  }
});
mp.events.add("playerQuit", (p) => {
  const s = sessions.get(p);
  if (!s) return;
  s.closed = true;
  destroyVehicle(s);
  sessions.delete(p);
  if (!s.busy && s.token) api("/bridge/logout", {}, s.token).catch(() => console.error("[citycore] Logout failed; next login resets shift"));
});
mp.events.add("playerDeath", (p) => {
  const s = sessions.get(p);
  if (!s) return;
  destroyVehicle(s);
  setTimeout(() => {
    if (alive(p, s)) {
      p.spawn(new mp.Vector3(LOCATIONS.depot.x, LOCATIONS.depot.y, LOCATIONS.depot.z));
      p.health = 100;
    }
  }, 4e3);
});
mp.events.add("playerEnterVehicle", (p, vehicle) => {
  for (const [owner, s] of sessions) if (s.vehicle === vehicle && owner !== p) p.removeFromVehicle();
});
setInterval(() => {
  var _a;
  for (const [p, s] of sessions) {
    if (!s.token || s.busy || !alive(p, s) || !((_a = s.state) == null ? void 0 : _a.character.on_shift)) continue;
    if (!s.vehicle || !mp.vehicles.exists(s.vehicle) || s.vehicle.engineHealth <= 0) {
      s.busy = true;
      cancel(p, s).catch(() => send(p, s, { kind: "notice", message: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0441\u043C\u0435\u043D\u0443. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u043F\u043E\u043F\u044B\u0442\u043A\u0430 \u0447\u0435\u0440\u0435\u0437 5 \u0441\u0435\u043A\u0443\u043D\u0434" })).finally(() => {
        s.busy = false;
      });
    }
  }
}, 5e3);
for (const [name, pos] of Object.entries(LOCATIONS)) {
  if (name === "vehicle") continue;
  mp.markers.new(1, new mp.Vector3(pos.x, pos.y, pos.z - 1), 1.3, { color: [112, 255, 183, 130], dimension: 0 });
  mp.blips.new(name === "bank" ? 108 : name === "shop" ? 52 : 478, new mp.Vector3(pos.x, pos.y, pos.z), { name: name === "bank" ? "CityCore Bank" : name === "shop" ? "CityCore Market" : "CityCore Delivery", color: 2, shortRange: true, dimension: 0 });
}
console.log(`[citycore] RAGE adapter ready (Node ${process.version}). API must be running separately.`);
//# sourceMappingURL=index.js.map
