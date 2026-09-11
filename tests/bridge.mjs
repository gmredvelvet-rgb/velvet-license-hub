/**
 * El puente que llevan los 13 modulos antiguos (bridge/license-hub.js), contra
 * el hub real. Toda decision de licencia de esos modulos pasa por
 * isModuleLicensed() — el verificador estatico del plan comprueba que ningun
 * candado lea el flag directamente —, asi que esto cubre R2/R3 (H1, H2-H5, H10).
 *
 * Tambien comprueba que las 13 copias sean identicas al puente canonico.
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const HUB = join(HERE, "..");
const MODULES = process.env.FOUNDRY_MODULES ?? "I:/Foundry_Data/Data/modules";

// ── Foundry simulado ─────────────────────────────────────────────────────────
const listeners = new Map();
globalThis.Hooks = {
  on(n, fn) { (listeners.get(n) ?? listeners.set(n, []).get(n)).push({ fn, once: false }); },
  once(n, fn) { (listeners.get(n) ?? listeners.set(n, []).get(n)).push({ fn, once: true }); },
  callAll(n, ...a) { const l = listeners.get(n) ?? []; listeners.set(n, l.filter(x => !x.once)); return l.map(x => x.fn(...a)); }
};
const values = new Map(); const registered = new Set();
const hubModule = { id: "velvet-license-hub", title: "Velvet License Hub", active: true };
globalThis.game = {
  view: "game", world: { id: "w" }, user: { isGM: false }, release: { generation: 13 },
  i18n: { lang: "es", localize: k => k, format: k => k },
  settings: {
    register(ns, k, c) { registered.add(`${ns}.${k}`); if ( !values.has(`${ns}.${k}`) ) values.set(`${ns}.${k}`, c.default); },
    registerMenu() {},
    get(ns, k) { if ( !registered.has(`${ns}.${k}`) ) throw new Error(`no registrado ${ns}.${k}`); return values.get(`${ns}.${k}`); },
    async set(ns, k, v) { values.set(`${ns}.${k}`, v); }
  },
  modules: new Map([
    ["velvet-license-hub", hubModule],
    ["hopefinder-sheet", { id: "hopefinder-sheet", active: true }],
    ["velvet-mobile", { id: "velvet-mobile", active: true }],
    ["dnd-shops", { id: "dnd-shops", active: true }]
  ])
};
globalThis.ui = { notifications: { info() {}, error() {} } };
globalThis.foundry = { applications: { api: { ApplicationV2: class {} } } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { createElement: () => ({ addEventListener() {}, classList: { contains: () => false }, remove() {} }), getElementById: () => null, body: { append() {}, contains: () => false } };
globalThis.fetch = async () => { throw new Error("sin red"); };

await import(pathToFileURL(join(HUB, "scripts/main.js")).href);
const { isModuleLicensed, licenseHub, hubActive } = await import(pathToFileURL(join(HUB, "bridge/license-hub.js")).href);
Hooks.callAll("init");
// Los modulos antiguos registran su propio flag de mundo.
for ( const id of ["hopefinder-sheet", "velvet-mobile"] ) game.settings.register(id, "worldLicensed", { default: false });

const future = Date.now() + 5 * 86400_000;
const set = (key, v) => values.set(key, v);
const results = [];
const check = (label, actual, expected) => results.push([label, actual === expected, actual]);

// H4 — hub sin veredicto, sin flag antiguo: cerrado, igual que hoy
check("H4 sin veredicto + sin flag -> cerrado", isModuleLicensed("hopefinder-sheet"), false);
// H3 — hub sin veredicto, flag antiguo true: abierto (R3, nadie que pagaba pierde acceso)
set("hopefinder-sheet.worldLicensed", true);
check("H3 sin veredicto + flag antiguo -> abierto", isModuleLicensed("hopefinder-sheet"), true);
// H1 — veredicto $6 que cubre el modulo
set("velvet-license-hub.worldLicence", { until: future, modules: ["hopefinder-sheet", "velvet-mobile", "dnd-shops"] });
set("hopefinder-sheet.worldLicensed", false);
check("H1 veredicto que lo cubre -> abierto (sin flag)", isModuleLicensed("hopefinder-sheet"), true);
// H2 — veredicto $3: solo velvet-mobile
set("velvet-license-hub.worldLicence", { until: future, modules: ["velvet-mobile"] });
check("H2 $3: velvet-mobile abierto", isModuleLicensed("velvet-mobile"), true);
check("H2 $3: hopefinder cerrado (como hoy con $3)", isModuleLicensed("hopefinder-sheet"), false);
// H5 — el hub ya hablo y no lo cubre: el flag antiguo deja de contar
set("hopefinder-sheet.worldLicensed", true);
check("H5 veredicto sin cubrirlo + flag antiguo -> cerrado", isModuleLicensed("hopefinder-sheet"), false);
// Veredicto caducado: sigue siendo del hub (hasVerdict) -> cerrado
set("velvet-license-hub.worldLicence", { until: Date.now() - 1000, modules: ["hopefinder-sheet"] });
check("veredicto caducado -> cerrado, el flag antiguo no resucita", isModuleLicensed("hopefinder-sheet"), false);
// Liberar la plaza: until 0 -> vuelve el flag antiguo (caso raro, documentado en D3)
set("velvet-license-hub.worldLicence", { until: 0, modules: [] });
check("tras liberar -> vuelve a contar el flag antiguo", isModuleLicensed("hopefinder-sheet"), true);
// Modulo sin flag propio (dnd-shops): sin veredicto -> false, sin lanzar
check("modulo sin flag propio, sin veredicto -> false sin lanzar", isModuleLicensed("dnd-shops"), false);
// H10 — hub activo sin API: cuenta como ausente -> flag antiguo
const api = hubModule.api; delete hubModule.api;
check("H10 hub sin API -> licenseHub() null", licenseHub(), null);
check("H10 hub sin API -> manda el flag antiguo", isModuleLicensed("hopefinder-sheet"), true);
hubModule.api = api;
// Hub inactivo
hubModule.active = false;
check("hub inactivo -> hubActive() false", hubActive(), false);
check("hub inactivo -> manda el flag antiguo", isModuleLicensed("hopefinder-sheet"), true);
hubModule.active = true;
// Version minima
check("licenseHub(3) con hub v2 -> null", licenseHub(3), null);

// ── Copias identicas ─────────────────────────────────────────────────────────
const canonical = readFileSync(join(HUB, "bridge/license-hub.js"), "utf8");
const COPIES = {
  "velvet-journals": "scripts/license-hub.js", "isometric-asset-palette": "scripts/license-hub.js",
  "directional-token-images": "scripts/license/license-hub.js", "velvet-move": "scripts/license/license-hub.js",
  "isometric-tokens-creator": "scripts/license/license-hub.js", "velvet-mobile": "scripts/license/license-hub.mjs",
  "pf2e-velvet-sheet": "scripts/license-hub.mjs", "dnd-velvet-sheets": "scripts/license-hub.mjs",
  "vnd-enhanced": "scripts/license-hub.js", "starfinderdashboard": "scripts/license-hub.js",
  "dnd-shops": "scripts/license-hub.js", "hopefinder-sheet": "scripts/license-hub.mjs",
  "sf2e-cyber-sheet": "scripts/license-hub.js"
};
const drift = Object.entries(COPIES).filter(([m, rel]) => {
  try { return readFileSync(join(MODULES, m, rel), "utf8") !== canonical; }
  catch { return true; }
}).map(([m]) => m);
check(`13 copias identicas al puente canonico${drift.length ? ` (difieren: ${drift.join(", ")})` : ""}`, drift.length, 0);

for ( const [label, ok, actual] of results ) console.log(`  ${ok ? "ok   " : "FALLO"} ${label}${ok ? "" : ` — salio ${JSON.stringify(actual)}`}`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
