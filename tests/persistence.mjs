/**
 * Persistencia del hub, con sus ficheros reales copiados a un directorio temporal
 * donde la clave publica RSA se sustituye por una de pruebas (para poder firmar
 * tokens aqui mismo). Nada mas cambia.
 *
 *   node persistence.mjs <dirHubCopia> <escenario> [worldId]
 *
 *   second-world  Navegador ya conectado entra en un mundo nuevo: el mundo debe
 *                 quedar licenciado sin tarjeta y sin tocar la red.
 *   fingerprint   Imprime el fingerprint que el cliente manda en /oauth/exchange,
 *                 para comparar entre mundos.
 */
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const [hubDir, scenario, worldId = "mundo-b"] = process.argv.slice(2);
const keys = JSON.parse(readFileSync(`${hubDir}/../test-keys.json`, "utf8"));

// ── Foundry simulado (igual que integration.mjs, reducido) ───────────────────
const listeners = new Map();
globalThis.Hooks = {
  on(n, fn) { (listeners.get(n) ?? listeners.set(n, []).get(n)).push({ fn, once: false }); },
  once(n, fn) { (listeners.get(n) ?? listeners.set(n, []).get(n)).push({ fn, once: true }); },
  callAll(n, ...a) { const l = listeners.get(n) ?? []; listeners.set(n, l.filter(x => !x.once)); return l.map(x => x.fn(...a)); }
};
const values = new Map(); const registered = new Set();
const writes = [];
globalThis.game = {
  view: "game", world: { id: worldId }, version: "13.346", release: { generation: 13 },
  user: { isGM: true }, i18n: { lang: "es", localize: k => k, format: k => k },
  settings: {
    register(ns, k, c) { registered.add(`${ns}.${k}`); values.set(`${ns}.${k}`, c.default); },
    registerMenu() {},
    get(ns, k) { if ( !registered.has(`${ns}.${k}`) ) throw new Error("x"); return values.get(`${ns}.${k}`); },
    async set(ns, k, v) { values.set(`${ns}.${k}`, v); writes.push(`${ns}.${k}`); Hooks.callAll("updateSetting", { key: `${ns}.${k}` }); }
  },
  modules: new Map([
    ["velvet-license-hub", { id: "velvet-license-hub", title: "Velvet License Hub", active: true }],
    ["tarokka", { id: "tarokka", title: "Tarokka", active: true }]
  ])
};
globalThis.ui = { notifications: { info() {}, error() {} } };
globalThis.foundry = { applications: { api: { ApplicationV2: class {} } } };
globalThis.location = { origin: "http://localhost:30000" };
globalThis.window = { open: () => null, addEventListener() {}, removeEventListener() {} };
const body = [];
globalThis.document = {
  createElement: () => ({ addEventListener() {}, classList: { contains: () => false }, remove() {} }),
  getElementById: () => null,
  body: { append: el => body.push(el), contains: () => false }
};

// ── localStorage: el mismo navegador que ya se conecto una vez ───────────────
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};
const IID = "11111111-2222-4333-8444-555555555555";
store.set("velvet-license-hub:iid", IID);

const network = [];
let exchangeFingerprint = null;
globalThis.fetch = async (url, init) => {
  network.push(String(url));
  if ( String(url).endsWith("/oauth/exchange") ) {
    exchangeFingerprint = JSON.parse(init.body).fingerprintHash;
    return new Response(JSON.stringify({ error: "fin de la prueba", code: "TEST" }), { status: 400 });
  }
  throw new Error("red no esperada");
};

// ── Un access token firmado como lo firmaria el worker ───────────────────────
const b64u = buf => Buffer.from(buf).toString("base64url");
async function sign(payload) {
  const key = await crypto.subtle.importKey("pkcs8", Buffer.from(keys.privateKey, "base64url"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

if ( scenario === "second-world" ) {
  const now = Math.floor(Date.now() / 1000);
  const verifiedUntil = Date.now() + 25 * 86400_000; // conectado hace 5 dias
  store.set("velvet-license-hub:at", await sign({
    sub: "u1", iid: IID, mid: "velvet-license-hub", tier: "basic",
    features: ["license-hub", "module:tarokka", "module:action-bubbles", "dnd-shops"], iat: now, exp: now + 3000, jti: "j1"
  }));
  store.set("velvet-license-hub:rt", "refresh-token-de-prueba");
  store.set("velvet-license-hub:exp", String(Date.now() + 3000_000));
  store.set("velvet-license-hub:tier", "basic");
  store.set("velvet-license-hub:until", String(verifiedUntil));

  await import(pathToFileURL(`${hubDir}/scripts/main.js`).href);
  await import(pathToFileURL(`${process.env.FOUNDRY_MODULES ?? "I:/Foundry_Data/Data/modules"}/tarokka/scripts/license/boot.js`).href);
  Hooks.callAll("init");
  Hooks.callAll("ready");
  await new Promise(r => setTimeout(r, 300));

  const { until, modules: published } = values.get("velvet-license-hub.worldLicence");
  const hub = game.modules.get("velvet-license-hub").api;
  const checks = [
    ["el mundo nuevo queda licenciado", hub.isLicensed() === true],
    ["con la fecha de la verificacion original (no una inventada)", until === verifiedUntil],
    ["con la cobertura que dice el token", published.join() === "tarokka,action-bubbles"],
    ["tarokka cubierto", hub.isLicensed("tarokka") === true],
    ["un modulo no cubierto no lo esta", hub.isLicensed("hopefinder-sheet") === false],
    ["sin tarjeta", body.length === 0],
    ["sin tocar la red", network.length === 0],
    ["una sola escritura del setting", writes.filter(w => w.endsWith("worldLicence")).length === 1]
  ];
  for ( const [label, ok] of checks ) console.log(`  ${ok ? "ok   " : "FALLO"} ${label}`);
  process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
}

if ( scenario === "request" || scenario === "request-nocreds" ) {
  const now = Math.floor(Date.now() / 1000);
  if ( scenario === "request" ) {
    store.set("velvet-license-hub:at", await sign({
      sub: "u1", iid: IID, mid: "velvet-license-hub", tier: "basic",
      features: ["license-hub", "module:dnd-shops", "dnd-shops"], iat: now, exp: now + 3000, jti: "j1"
    }));
    store.set("velvet-license-hub:rt", "rt-1");
    store.set("velvet-license-hub:exp", String(Date.now() + 3000_000));
    store.set("velvet-license-hub:tier", "basic");
    store.set("velvet-license-hub:until", String(Date.now() + 20 * 86400_000));
  }
  const { default: LicenseClient } = await import(pathToFileURL(`${hubDir}/scripts/license.js`).href);
  const client = LicenseClient.instance;

  const calls = [];
  let aiAttempts = 0;
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: init.method, auth: init.headers.Authorization ?? null, body: init.body ?? null });
    const json = (status, data) => new Response(JSON.stringify(data), { status });
    if ( path === "/shops/data" ) return json(200, { categories: ["armas"] });
    if ( path === "/ai/history" ) return json(200, { items: [], limit: new URL(url).searchParams.get("limit") });
    if ( path === "/ai/tokens" ) {
      aiAttempts += 1;
      return aiAttempts === 1 ? json(401, { error: "Invalid token", code: "INVALID_TOKEN" }) : json(200, { tokens: 7 });
    }
    if ( path === "/token/refresh" ) {
      return json(200, { accessToken: await sign({ sub: "u1", iid: IID, tier: "basic", features: ["dnd-shops"], iat: now, exp: now + 3600, jti: "j2" }),
        refreshToken: "rt-2", expiresIn: 3600 });
    }
    return json(404, { error: "no", code: "NOT_FOUND" });
  };

  const attempt = async fn => { try { return { ok: await fn() }; } catch ( err ) { return { code: err.code }; } };
  const checks = [];

  if ( scenario === "request" ) {
    const shops = await attempt(() => client.request("GET", "/shops/data"));
    const shopCall = calls.find(c => c.path === "/shops/data");
    checks.push(["GET /shops/data devuelve el catalogo", shops.ok?.categories?.[0] === "armas"]);
    checks.push(["...con el token del hub como Bearer", shopCall?.auth?.startsWith("Bearer ey") === true]);
    checks.push(["...por GET y sin cuerpo", shopCall?.method === "GET" && shopCall.body === null]);

    const before = calls.length;
    const ai = await attempt(() => client.request("GET", "/ai/tokens"));
    const seq = calls.slice(before).map(c => c.path).join(" > ");
    checks.push(["401 INVALID_TOKEN: un refresh y un reintento", ai.ok?.tokens === 7 && seq === "/ai/tokens > /token/refresh > /ai/tokens", seq]);
    checks.push(["el refresh rota el refresh token", localStorage.getItem("velvet-license-hub:rt") === "rt-2"]);

    const post = await attempt(() => client.request("POST", "/shops/data", { a: 1 }));
    const postCall = calls.at(-1);
    checks.push(["POST lleva el cuerpo tal cual, sin nonce", post.ok !== undefined && postCall.body === '{"a":1}']);

    const q = await attempt(() => client.request("GET", "/ai/history?limit=20"));
    const qCall = calls.at(-1);
    checks.push(["ruta con query plana (AI Studio): aceptada", q.ok?.limit === "20" && qCall.path === "/ai/history"]);

    const n = calls.length;
    const evilQ = await attempt(() => client.request("GET", "/ai/history?x=@evil.example"));
    checks.push(["query con @: rechazada sin red", evilQ.code === "BAD_REQUEST" && calls.length === n]);
    const evil = await attempt(() => client.request("GET", "@evil.example/steal"));
    const evil2 = await attempt(() => client.request("GET", "//evil.example/steal"));
    const evil3 = await attempt(() => client.request("DELETE", "/shops/data"));
    checks.push(["ruta que cambiaria de host: rechazada sin red", evil.code === "BAD_REQUEST" && evil2.code === "BAD_REQUEST" && calls.length === n]);
    checks.push(["metodo no soportado: rechazado", evil3.code === "BAD_REQUEST" && calls.length === n]);

    game.user.isGM = false;
    const player = await attempt(() => client.request("GET", "/shops/data"));
    checks.push(["jugador: NO_CREDENTIALS sin red", player.code === "NO_CREDENTIALS" && calls.length === n]);
  }
  else {
    const none = await attempt(() => client.request("GET", "/shops/data"));
    checks.push(["GM sin credenciales: NO_CREDENTIALS sin red", none.code === "NO_CREDENTIALS" && calls.length === 0]);
  }

  for ( const [label, ok, extra] of checks ) console.log(`  ${ok ? "ok   " : "FALLO"} ${label}${ok || !extra ? "" : ` — ${extra}`}`);
  process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
}

if ( scenario === "fingerprint" ) {
  const { default: LicenseClient } = await import(pathToFileURL(`${hubDir}/scripts/license.js`).href);
  await LicenseClient.instance.initialize();
  await LicenseClient.instance.activateWithCode("codigo").catch(() => {});
  console.log(exchangeFingerprint);
  process.exit(0);
}
