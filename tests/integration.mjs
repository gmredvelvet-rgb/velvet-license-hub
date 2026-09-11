/**
 * Integración hub <-> módulos con los ficheros reales, sobre un Foundry
 * simulado. Cada escenario corre en su propio proceso (los ESM se cachean):
 *
 *   node integration.mjs <escenario>
 *
 * Escenarios: hub-trial, hub-licensed, hub-mobile, hub-empty, no-hub, hub-broken, player
 */
import { pathToFileURL } from "node:url";

// Carpeta de modulos de Foundry. Por defecto la de esta maquina.
const MODULES = process.env.FOUNDRY_MODULES ?? "I:/Foundry_Data/Data/modules";
const COVERED = ["tarokka", "action-bubbles"];
const scenario = process.argv[2];

// ── Hooks ────────────────────────────────────────────────────────────────────
const listeners = new Map();
globalThis.Hooks = {
  on(name, fn) { (listeners.get(name) ?? listeners.set(name, []).get(name)).push({ fn, once: false }); },
  once(name, fn) { (listeners.get(name) ?? listeners.set(name, []).get(name)).push({ fn, once: true }); },
  callAll(name, ...args) {
    const list = listeners.get(name) ?? [];
    listeners.set(name, list.filter(l => !l.once));
    // Foundry llama a los listeners en serie y sin esperar a los async.
    return list.map(l => l.fn(...args));
  }
};

// ── Settings ─────────────────────────────────────────────────────────────────
const values = new Map();
const registered = new Set();
const menus = [];
const settings = {
  register(ns, key, cfg) { registered.add(`${ns}.${key}`); if ( !values.has(`${ns}.${key}`) ) values.set(`${ns}.${key}`, cfg.default); },
  registerMenu(ns, key) { menus.push(`${ns}.${key}`); },
  get(ns, key) {
    if ( !registered.has(`${ns}.${key}`) ) throw new Error(`no registrado ${ns}.${key}`);
    return values.get(`${ns}.${key}`);
  },
  async set(ns, key, v) { values.set(`${ns}.${key}`, v); Hooks.callAll("updateSetting", { key: `${ns}.${key}` }); return v; }
};

// ── Módulos ──────────────────────────────────────────────────────────────────
const hubActive = scenario !== "no-hub";
const covered = scenario === "hub-empty" ? [] : COVERED;
const modules = new Map([
  ["velvet-license-hub", { id: "velvet-license-hub", title: "Velvet License Hub", active: hubActive }],
  // Aun no registra por si mismo (fase 5 del plan): el escenario hub-mobile lo
  // registra a mano para tener un modulo cubierto y otros en prueba.
  ["velvet-mobile", { id: "velvet-mobile", title: "Velvet Mobile", active: scenario === "hub-mobile" }]
]);
for ( const id of COVERED ) modules.set(id, { id, title: id === "tarokka" ? "Tarokka" : "Action Bubbles", active: covered.includes(id) });

globalThis.game = {
  view: "game",
  world: { id: "mundo-a" },
  version: "13.346",
  release: { generation: 13 },
  user: { isGM: scenario !== "player" },
  i18n: { lang: "es", localize: k => k, format: k => k },
  settings,
  modules
};
globalThis.ui = { notifications: { info() {}, error() {}, warn() {} } };
globalThis.foundry = { applications: { api: { ApplicationV2: class {} } } };

// ── Red: ningún escenario sin credenciales debería tocarla ───────────────────
const network = [];
globalThis.fetch = async url => { network.push(String(url)); throw new Error("red prohibida en este escenario"); };

// ── Almacenamiento y entorno de navegador ────────────────────────────────────
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};
globalThis.location = { origin: "http://localhost:30000" };
globalThis.screen = { width: 1920, height: 1080, colorDepth: 24 };
globalThis.window = { open: () => null, addEventListener() {}, removeEventListener() {} };

// ── DOM mínimo: lo justo para contar tarjetas ────────────────────────────────
const body = [];
const makeEl = () => {
  const el = {
    id: "", className: "", innerHTML: "",
    addEventListener() {},
    classList: { contains: c => el.className.split(/\s+/).includes(c) },
    remove() { const i = body.indexOf(el); if ( i >= 0 ) body.splice(i, 1); },
    querySelector: () => null
  };
  return el;
};
globalThis.document = {
  createElement: makeEl,
  getElementById: id => body.find(e => e.id === id) ?? null,
  body: { append: el => body.push(el), contains: el => body.includes(el) }
};

// ── Estado previo según escenario ────────────────────────────────────────────
const future = Date.now() + 10 * 86400_000;
if ( scenario === "hub-licensed" ) values.set("velvet-license-hub.worldLicence", { until: future, modules: [...COVERED] });
if ( scenario === "hub-mobile" ) values.set("velvet-license-hub.worldLicence", { until: future, modules: ["velvet-mobile"] });

// ── Carga, en el orden que usaría Foundry ────────────────────────────────────
const load = rel => import(pathToFileURL(`${MODULES}/${rel}`).href);
if ( hubActive ) await load("velvet-license-hub/scripts/main.js");
for ( const id of covered ) await load(`${id}/scripts/license/boot.js`);

if ( scenario === "hub-mobile" ) Hooks.once("ready", () => game.modules.get("velvet-license-hub").api.register("velvet-mobile"));
Hooks.callAll("init");
if ( scenario === "hub-broken" ) delete modules.get("velvet-license-hub").api;
Hooks.callAll("ready");
// Dejar correr todo lo asíncrono (el yield del hub, initialize, fingerprints).
await new Promise(r => setTimeout(r, 300));

// ── Resultado ────────────────────────────────────────────────────────────────
const cards = body.map(e => e.id);
const hubCard = body.find(e => e.id === "velvet-license-hub-card");
const report = {
  cards,
  menus,
  network: network.length,
  hubLists: hubCard ? covered.filter(id => hubCard.innerHTML.includes(modules.get(id).title)) : [],
  hubCardKind: hubCard?.className ?? null,
  partial: hubCard ? hubCard.innerHTML.includes("TrialPartial") : null,
  listsMobile: hubCard ? hubCard.innerHTML.includes("Velvet Mobile") : null,
  api: hubActive ? {
    version: modules.get("velvet-license-hub").api?.apiVersion ?? null,
    mobile: modules.get("velvet-license-hub").api?.isLicensed("velvet-mobile") ?? null,
    tarokka: modules.get("velvet-license-hub").api?.isLicensed("tarokka") ?? null,
    verdict: modules.get("velvet-license-hub").api?.hasVerdict() ?? null
  } : null
};
console.log(JSON.stringify(report));
// El recordatorio deja un setInterval de 5 min vivo: salir a mano.
process.exit(0);
