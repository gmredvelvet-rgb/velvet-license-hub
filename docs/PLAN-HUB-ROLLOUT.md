# Plan — Velvet License Hub como licencia única y obligatoria

> **Para el agente que ejecute esto.** Lee las secciones 1 a 4 antes de tocar nada.
> Luego ejecuta las fases **en orden**; cada una trae objetivo, ficheros, pasos,
> verificación y criterio de terminado. Marca el estado en la **sección 8** al
> cerrar cada fase, con fecha y una línea de qué quedó. Las fases marcadas
> **⛔ PARADA** necesitan al usuario (publicar, desplegar, decidir): no las
> saltes ni las simules.
>
> Los números de línea son de 2026-09-11. **Vuelve a hacer grep antes de editar**:
> el usuario sigue trabajando en estos módulos.

---

## 1. Objetivo

1. **Una sola validación**: el GM conecta Patreon una vez, en el hub, y todos los
   módulos de GM RedVelvet quedan licenciados, en todos sus mundos.
2. **El hub es dependencia obligatoria** de todos los módulos
   (`relationships.requires`): instalar o activar cualquier módulo trae el hub.
3. **El hub es quien decide** si el mundo paga o no. Los módulos le preguntan a él.

## 2. Reglas que no se negocian

- **R1 — Soft gate intacto.** Un módulo que hoy no bloquea nada seguirá sin
  bloquear nada. El hub solo quita el recordatorio.
- **R2 — Los hard gates bloquean exactamente lo mismo que hoy**, ni más ni menos;
  solo cambia *quién* da el veredicto.
- **R3 — Nadie que ya pague pierde acceso** en la transición. Ver D3.
- **R4 — El tier de $3 sigue abriendo `velvet-mobile`.** Hoy el hub lo rechaza; si
  pasa a ser obligatorio sin arreglarlo, se rompe el módulo a esos patrones. Ver D2.
- **R5 — Las credenciales nunca salen del `localStorage` del GM.** Los settings de
  mundo llegan a todos los jugadores y el token de acceso es *bearer*: abre `/ai`
  (gasta la cuota de AI Studio del dueño) y `/shops/data`.
- **R6 — No se mezcla trabajo del usuario.** Varios repos tienen cambios sin
  commitear (sección 3.3). Si un fichero a editar tiene cambios sin commitear que
  no son de este plan: **para y pregunta**. Nunca `git stash`, `reset` ni
  `checkout --` sobre trabajo ajeno.
- **R7 — Nada se publica ni se despliega sin el usuario.** Commits locales en rama
  sí; `push`, tags, releases y `wrangler deploy`, no.

---

## 3. Inventario (estado a 2026-09-11)

### 3.1 Cómo usa cada módulo su licencia

**Clase**: `soft` = solo recordatorio · `hard` = bloquea funciones ·
`server` = recibe contenido del worker con su token.

| Módulo | Clase | Cliente actual | Dónde se consulta la licencia |
| --- | --- | --- | --- |
| `hopefinder-sheet` | **hard** | `license-client.mjs` antiguo | `sheet.mjs:574` overlay opaco que tapa la hoja si `!worldLicensed` (`_injectLicenseOverlay`, `:621`) |
| `sf2e-cyber-sheet` | **hard** | `license-client.js` antiguo | `hologram-animator.js:253` y `sheet-effects.js:774` apagan FX si `!worldLicensed` |
| `velvet-mobile` | **hard**, tier $3 | `license/license-client.mjs` (ventana 30 d) | `main.mjs:223` `deactivate()` si `!Settings.worldLicensed` (getter en `core/settings.mjs:196`) |
| `starfinderdashboard` | **hard** | `license-client.js` antiguo | `main.js:141-149` no activa el dashboard si `!worldLicensed`; **se lee en `setup`**, no en `ready` |
| `dnd-shops` | **server** | `license-client.js` antiguo | `dnd-shops.mjs:836-860` el GM pide el catálogo a `/shops/data` (`license-client.js:146`) y lo cachea en el setting `shopDataCache` para los jugadores |
| `vnd-enhanced` | soft + **server** | `license-client.js` antiguo | `main.js:5729-5790` recordatorio; `ai-generator.js:161` lee `vnd-enhanced:at` de `localStorage` para `/ai/*`; expone `globalThis.VNEnhanced.license` a macros (`main.js:~5795`) |
| `pf2e-velvet-sheet` | soft | `license-client.mjs` antiguo | `velvet-sheet.mjs:2810-2825` init + recordatorio; panel "Connect to unlock" en `:1102-1139` |
| `dnd-velvet-sheets` | soft | `license-client.mjs` antiguo | `aaa-sheet.mjs:947-984` panel; buscar el hook `ready` |
| `velvet-journals` | soft | `license.js` (referencia) | `main.js:29,110,113,126` |
| `isometric-asset-palette` | soft | `license.js` (referencia) | `main.js:77,153,156,169` |
| `directional-token-images` | soft | `license/license.js` | `module.js:48,114,117` |
| `velvet-move` | soft | `license/license-client.js` | `main.js:101,116` + `registerLicenseMenu` |
| `isometric-tokens-creator` | soft | `license/license-client.js` | `main.js:97,111` + `registerLicenseMenu` |
| los 15 del port¹ | soft | `scripts/license/` | ya consultan el hub (API v1): `boot.js` registra y se calla |

¹ `action-bubbles`, `quest-board`, `velvet-poker`, `tarokka`, `domatori`,
`srg-deluxe`, `pf2e-statblock-parser`, `redvelvet-ai-map-forge`,
`redvelvet-cooking-system`, `redvelvet-crafting-system`,
`redvelvet-crafting-dnd5e`, `redvelvet-crafting-pf2e`, `redvelvet-settlement`,
`GMRedvelvet-stf2e-hacking`, `foundry-rolls-bridge`.

Los 13 primeros meten `game.world.id` en el fingerprint: en cuanto dejen de usar
su propio cliente (hub activo), ese fallo deja de importar. Ver `README.md`.

### 3.2 Rutas del worker que usan módulos con token

| Ruta | Middleware | Qué exige |
| --- | --- | --- |
| `GET /shops/data` | `requireAuth` | `payload.features` incluye `dnd-shops` |
| `POST /ai/expand`, `POST /ai/generate` | `requireAuth` | tier de la cuenta (cuota por tier) |
| `GET /ai/tokens`, `GET /ai/history` | `requireAuth` | token válido |

Ninguna exige nonce. Todas aceptarán el token del hub si lleva las features (D2).

### 3.3 Estado de los repos

| Módulo | Git | Notas |
| --- | --- | --- |
| `velvet-move` | sí | limpio: el trabajo pendiente se commiteó (`4e3ebcb`) a petición del usuario |
| `redvelvet-cooking-system` | sí, rama **`cociuna2`** | **31 cambios sin commitear** |
| `action-bubbles` | sí | 5 sin commitear (incluye el port de hoy) |
| `pf2e-statblock-parser` | sí | 4 sin commitear (incluye el port) |
| `vnd-enhanced` | sí | `docs/PAID-UPDATE-GATING.md` + `.patch` sin versionar: plan aparte (cerrar *actualizaciones* a no suscriptores con manifiestos por suscriptor). Compatible con el hub, sin implementar. No tocar |
| `isometric-asset-palette` | sí | `.github/` y `docs/` sin versionar (docs incluye `SOFT-GATE.md`) |
| `hopefinder-sheet`, `dnd-velvet-sheets` | sí | `module.json` **reescrito por el instalador de Foundry** (styles como objetos, `flags: {}`, `download` fijado a la versión, `&` → `&amp;`). No es trabajo del usuario pero tampoco se commitea: **preguntar** antes de la fase 8 |
| `starfinderdashboard` | sí, rama **`master`** | limpio |
| resto con git | sí, `main` | limpio |
| `velvet-journals`, `quest-board`, `velvet-poker`, `tarokka`, `domatori`, `srg-deluxe`, `redvelvet-ai-map-forge`, `redvelvet-crafting-*` (3), `redvelvet-settlement`, `GMRedvelvet-stf2e-hacking`, `foundry-rolls-bridge` | **no** | `velvet-journals` y `quest-board` publican desde GitHub: el checkout vive en otra ruta. **Pregunta al usuario** dónde está cada repo y cómo distribuye los que no tienen GitHub (¿zip por Patreon?) |

Git en `I:` y `G:` necesita `-c safe.directory=<ruta>` en cada comando (sistema de
ficheros sin propietarios). **No** cambies la config global.

---

## 4. Decisiones de diseño

### D1 — El estado del mundo pasa a ser por módulo

Hub 1.0 guardaba una fecha (`licensedUntil`). No basta: un patrón de $3 está
licenciado **solo** para `velvet-mobile`. Hub 2.0 guarda un único setting de mundo,
`worldLicence = { until, modules }`:

| Campo | Significado |
| --- | --- |
| `until` | epoch ms; el veredicto vale hasta entonces |
| `modules` | ids de módulo que cubre ese veredicto, **según el servidor** |

Un solo objeto y no dos settings: la escritura es atómica (ningún cliente ve una
fecha nueva con una lista vieja) y cada cambio se difunde una vez.

`isLicensed(id)` = `until > now && modules.includes(id)`.
La lista la da el servidor (D2), nunca se deduce en el cliente: así una alta
nueva en el catálogo se cubre sola en el siguiente latido.

Se publica solo desde una verificación viva (tier ≠ `none` y features presentes):
una ventana de confianza sin token no debe vaciar la lista. Hub 1.0 nunca se
publicó, así que no hay estado 1.0 que migrar.

### D2 — El token del hub lleva la cobertura y las features de todo el catálogo

Backend, `src/patreon.js`:

- `velvet-license-hub` entra en `MOBILE_TIER_MODULES`, para que el tier de $3
  pueda activarlo (R4).
- `featuresForTier(tier, 'velvet-license-hub')` se calcula del catálogo:
  `['license-hub', 'module:<id>' por cada módulo cuyo effectiveTier ≠ none, …la
  unión de sus features]`. Con $3 sale `['license-hub', 'module:velvet-mobile',
  'mobile-shell']`; con $6, todo.
- Consecuencia gratis: `/shops/data` acepta el token del hub (lleva `dnd-shops`), y
  `/ai/*` ya lo aceptaba (mira el tier, no el módulo).

### D3 — Precedencia en la transición: el hub manda en cuanto ha hablado

Los módulos antiguos tienen su propio `worldLicensed`, que puede estar a `true`
por una activación de antes. Regla, igual para todos:

```js
licencia efectiva = hub.hasVerdict() ? hub.isLicensed(MODULE_ID) : worldLicensed_propio
```

- Un patrón que ya pagaba **no pierde nada** al actualizar (R3): su flag antiguo
  sigue valiendo hasta que conecte el hub.
- En cuanto el hub da un veredicto en ese mundo, el flag antiguo deja de contar. Así
  se acaba la pegajosidad del booleano: un ex-patrón no conserva acceso para siempre.
- `hasVerdict()` = `worldLicence.until > 0`. Liberar la plaza lo pone a 0 y devuelve el
  mundo al flag antiguo: aceptable, es un caso raro y el recordatorio sigue.

### D4 — Las llamadas al servidor pasan por el hub

`hub.api.request(method, path, body?)`: petición autenticada con el token del hub,
refresco serializado incluido, verificación de firma si la respuesta viene firmada.
**Solo funciona en el navegador del GM con credenciales**; en cualquier otro lanza
`LicenseError('NO_CREDENTIALS')`. El token nunca se entrega a quien llama (R5).
`dnd-shops` y `vnd-enhanced` dejan de leer sus propios tokens.

### D5 — Dependencia obligatoria

En el `module.json` de **cada** módulo, añadir sin pisar lo que ya haya:

```json
"relationships": {
  "requires": [{
    "id": "velvet-license-hub",
    "type": "module",
    "manifest": "https://github.com/gmredvelvet-rgb/velvet-license-hub/releases/latest/download/module.json",
    "compatibility": { "minimum": "2.0.0" }
  }]
}
```

**Orden obligatorio**: el hub tiene que estar publicado y su manifiesto resolviendo
**antes** de publicar cualquier módulo que lo requiera. Si no, la instalación falla
con "dependencia no encontrada".

### D6 — Los clientes propios se apagan ya y se borran después

Con el hub obligatorio, el cliente propio de cada módulo es código muerto. Pero
borrarlo en la misma release que introduce el hub quita la red de seguridad si el
hub falla en producción. Así que:

- **Ahora** (fases 4-6): si el hub está activo con API ≥ 2, el módulo no arranca su
  cliente, ni su tarjeta, ni su menú de licencia.
- **Después de una release estable** (fase 11): borrar los clientes propios y dejar
  un shim de ~30 líneas.

### D7 — Migración de patrones existentes: reconexión única (por defecto)

- **Opción A (por defecto):** tras actualizar, el patrón ve la tarjeta del hub y
  conecta una vez. No pierde acceso mientras tanto (D3).
- **Opción B (no implementada):** endpoint `/oauth/migrate` que canjee un refresh
  token antiguo por credenciales del hub sin pasar por Patreon. Más backend y
  choreografía entre módulos, y el fingerprint antiguo depende del mundo, así que
  el canje falla justo en el caso que querría arreglar. Solo si A resulta molesta
  en la práctica.

**Decidido (2026-09-11): opción A**, confirmada por el usuario.

### D8 — Contrato de la API v2

`game.modules.get("velvet-license-hub").api`:

| Miembro | Desde | Uso |
| --- | --- | --- |
| `apiVersion` | v1 | `2` |
| `register(moduleId)` | v1 | declara cobertura en este mundo; en `ready`, antes de cualquier `await` |
| `openLicenseCard()` | v1 | abre la tarjeta del hub |
| `isLicensed(moduleId?)` | v1 → **ampliado** | con id: cubierto por el veredicto actual. Sin id: hay algún veredicto vigente (compatible con v1) |
| `hasVerdict()` | **v2** | el hub ha licenciado este mundo alguna vez (D3) |
| `request(method, path, body?)` | **v2** | D4 |

Los 15 del port exigen `>= 1` y solo usan `register`: funcionan con v2 sin cambios.
Los módulos que usen `hasVerdict`/`request` exigen `>= 2`.

### D9 — Helper común para los 13 módulos antiguos

Un fichero `license-hub.js` (o `.mjs`, según el módulo), junto al cliente de licencia de
cada módulo e idéntico en todos. **La copia canónica vive en `bridge/license-hub.js` de
este repo**; `tests/bridge.mjs` falla si alguna copia difiere. Se llama `license-hub` y
no `hub` porque `velvet-journals` ya tiene un `scripts/hub.js` propio. Resumen:

```js
const HUB_ID = "velvet-license-hub";

/** La API del hub (>= minVersion) o null. Un hub activo sin API cuenta como ausente.
 *  1 basta para register(); hasVerdict() y request() piden 2. */
export function licenseHub(minVersion = 1) {
  const hub = game.modules.get(HUB_ID);
  return (hub?.active && (hub.api?.apiVersion >= minVersion)) ? hub.api : null;
}

/** true si el hub está activo en el mundo (lo único que se sabe en `init`). */
export function hubActive() {
  return game.modules.get(HUB_ID)?.active === true;
}

/** Licencia efectiva del módulo. D3: el hub manda en cuanto ha hablado. */
export function isModuleLicensed(moduleId) {
  const hub = licenseHub();
  if ( hub?.hasVerdict() ) return hub.isLicensed(moduleId);
  try {
    return game.settings.get(moduleId, "worldLicensed") === true;
  }
  catch ( err ) {
    return false;
  }
}
```

Los settings del hub se registran en `init`, así que `isModuleLicensed` es válido
desde `setup` — importante para `starfinderdashboard`, que decide en `setup`.

---

## 5. Fases

### Fase 0 — Preparación

1. Por cada repo git de la sección 3.3: `git -c safe.directory=<ruta> status`. Anota
   los ficheros sucios. Crea la rama `feat/license-hub` desde la rama actual
   (**no** desde `main` en `redvelvet-cooking-system`: está en `cociuna2`; pregunta).
2. Copia de seguridad de cada `module.json` y de cada fichero que vayas a editar en
   el scratchpad, antes de editar.
3. Línea base: `node scripts/verify-tiers.js` y `node scripts/verify-security.js` en
   el backend deben pasar.

**Terminado cuando:** hay rama en cada repo git limpio y la lista de sucios está
anotada en la sección 8.

### Fase 1 — Backend (D2)

Repo `G:\backend\velvet-license-backend`, fichero `src/patreon.js`:

1. `MOBILE_TIER_MODULES`: añadir `'velvet-license-hub'`.
2. `featuresForTier`: si `moduleId === 'velvet-license-hub'`, devolver la lista
   calculada del catálogo (excluyendo el propio hub; `effectiveTier` por módulo).
3. `scripts/verify-tiers.js`: la expectativa "solo `velvet-mobile` entrega features
   a $3" pasa a "solo los de `MOBILE_TIER_MODULES`". Añadir casos: hub con $3 cubre
   `module:velvet-mobile` y **no** `module:vnd-enhanced`; hub con $6 incluye
   `dnd-shops`.
4. Levantar `wrangler dev --local` y comprobar `/oauth/start` con el hub.

**⛔ PARADA:** `npx wrangler deploy` lo ejecuta el usuario. Verificar después con
`POST /oauth/start` contra producción.

### Fase 2 — Hub 2.0.0 (D1, D4, D8)

Repo `I:\Foundry_Data\Data\modules\velvet-license-hub`:

1. `world.js`: setting `worldLicence = { until, modules }`; `isLicensed(id?)`, `hasVerdict()`.
2. `license.js`: `publishWorldLicence()` publica fecha **y** lista (`module:*` de
   las features vivas); reescribe si cambia la lista aunque la fecha no gane un día.
   `request(method, path, body)` público (GET sin body, sin nonce).
3. `license-ui.js`: tarjeta con dos listas — cubiertos y en prueba — para el caso
   $3. Recordatorio si hay algún módulo registrado sin cubrir.
4. `main.js`: API v2.
5. `module.json`: `version 2.0.0`, `url`, `manifest`, `download` (patrón de
   `isometric-asset-palette`). Releases con `tools/release.sh <versión>`, no con un
   workflow: el token de `gh` de esta máquina no tiene el scope `workflow` y GitHub
   rechaza cualquier push que toque `.github/workflows`.
6. README y CHANGELOG.

**Verificación:** los arneses de la sección 6, escenarios H1-H9.

### Fase 3 — Publicar el hub ⛔ PARADA

El usuario crea `gmredvelvet-rgb/velvet-license-hub` en GitHub, añade el remoto,
hace push y crea el tag `v2.0.0` (el workflow genera la release). Verificar:

```
curl -sL https://github.com/gmredvelvet-rgb/velvet-license-hub/releases/latest/download/module.json
```

devuelve el manifiesto con `"version": "2.0.0"`. **Sin esto no se publica ningún
módulo con la dependencia.**

### Fase 4 — Módulos soft

Para cada uno: copiar `hub.js` (D9); en `init`, si `hubActive()`, **no** registrar
el menú de licencia propio; en `ready`, si `licenseHub()`, `register(MODULE_ID)` y
salir antes de inicializar el cliente propio o mostrar su tarjeta; el
`updateSetting` propio no reanuda el recordatorio con el hub activo.

| Módulo | Dónde |
| --- | --- |
| `velvet-journals` | `main.js` hooks `init`/`ready`/`updateSetting` (29, 110-126) |
| `isometric-asset-palette` | `main.js` (77, 153-169) |
| `directional-token-images` | `module.js` (48, 114-117) |
| `velvet-move` | `main.js` (101, 116) y `registerLicenseMenu` |
| `isometric-tokens-creator` | `main.js` (97, 111) y `registerLicenseMenu` |
| `pf2e-velvet-sheet` | `velvet-sheet.mjs` (2810-2825); el panel "Connect to unlock" (1102-1139) debe llamar a `hub.openLicenseCard()` si hay hub |
| `dnd-velvet-sheets` | `aaa-sheet.mjs` (947-984) + su hook `ready`; igual que el anterior |
| `vnd-enhanced` | `main.js` (5729-5790). La parte server va en la fase 6 |

### Fase 5 — Hard gates (R2, D3)

Sustituir **cada lectura** de `worldLicensed` por `isModuleLicensed(MODULE_ID)`, y
aplicar además lo de la fase 4 (no arrancar cliente/tarjeta/menú propios con hub).

| Módulo | Lecturas a sustituir |
| --- | --- |
| `hopefinder-sheet` | `sheet.mjs:574` |
| `sf2e-cyber-sheet` | `hologram-animator.js:253`, `sheet-effects.js:774`; localizar dónde arranca su cliente |
| `velvet-mobile` | el getter `Settings.worldLicensed` (`core/settings.mjs:196`) → delega en `isModuleLicensed` |
| `starfinderdashboard` | `main.js:141` y la re-comprobación de `:149`; decide en `setup` (válido, D9) |

Buscar con grep **todas** las lecturas; la tabla es el mínimo conocido. Además,
escuchar `updateSetting` de `velvet-license-hub.worldLicence` para re-renderizar o reactivar sin recargar donde hoy se escucha
el `worldLicensed` propio.

### Fase 6 — Contenido servido por el worker (D4)

- `dnd-shops`: `loadShopData()` (`dnd-shops.mjs:836`) usa
  `hub.request('GET', '/shops/data')` si hay hub con API ≥ 2; la caché
  `shopDataCache` para jugadores no cambia. Revisar también `:106-127`, `:180` y el
  botón de desbloqueo de `:249-254` (→ `hub.openLicenseCard()`).
- `vnd-enhanced`: `ai-generator.js` deja de leer `vnd-enhanced:at` y usa
  `hub.request` para `/ai/expand`, `/ai/generate`, `/ai/tokens`, `/ai/history`.
  `globalThis.VNEnhanced.license`: mantener una fachada compatible
  (`isLicensed`, `tier`) respaldada por el hub; buscar consumidores en macros
  documentadas (README, `docs/`) antes de cambiar su forma.

### Fase 7 — Los 15 del port

Nada de código: ya consultan el hub con API v1, que v2 mantiene. Solo reciben la
dependencia en la fase 8.

### Fase 8 — Dependencia obligatoria (D5)

Script que, para los 28 `module.json`: añade la entrada de `requires` sin pisar las
existentes (y sin duplicarla), sube la versión menor y añade una línea al
CHANGELOG (crearlo si no existe). Verificar con un script que los 28 la tengan
exactamente una vez.

### Fase 9 — Verificación integral

Todos los escenarios de la sección 6, más un Foundry real (el usuario):
instalar un módulo por manifiesto en una instalación sin el hub y comprobar que
Foundry ofrece instalarlo; activar un módulo en un mundo y comprobar que exige
activar el hub.

### Fase 10 — Releases ⛔ PARADA

Orden: backend desplegado (fase 1) → hub 2.0.0 publicado (fase 3) → módulos, en
cualquier orden. Confirmar D7 con el usuario antes. El usuario hace push, tags y
releases; para los módulos sin GitHub, preguntarle cómo distribuye.

### Fase 11 — Limpieza (tras una release estable)

Borrar los clientes propios de los 28 módulos, dejando `hub.js` y lo mínimo para
la regla D3 (lectura del `worldLicensed` antiguo). Los 15 del port pasan de
`scripts/license/` (4 ficheros) a un solo shim. Quitar las claves i18n de licencia
que queden huérfanas.

---

## 6. Pruebas

Arneses versionados en `tests/` de este repo: cargan los ficheros **reales** sobre
un Foundry simulado (hooks, settings, módulos, DOM mínimo, `localStorage`, `fetch`
interceptado, tokens firmados con una clave RSA de pruebas generada al vuelo).

```
bash tests/run.sh          # FOUNDRY_MODULES=<carpeta de modulos> para otra maquina
```

Hoy cubren H1, H2, H7, H8, H9, H10 y `request()`. Al integrar cada módulo
(fases 4-6), **añade su escenario a `tests/integration.mjs`** y su línea a
`run.sh`: H3-H6 y H11 dependen de módulos que aún no consultan el hub.

| Id | Escenario | Esperado |
| --- | --- | --- |
| H1 | Hub con $6 licenciado | ninguna tarjeta; todos los módulos licenciados; hard gates abiertos; 0 red en jugadores |
| H2 | Hub con $3 | `velvet-mobile` licenciado; el resto en prueba en **una** tarjeta del hub; `hopefinder-sheet` bloqueada (igual que hoy con $3) |
| H3 | Hub sin veredicto + flag antiguo `true` | hard gates **abiertos** (R3); tarjeta del hub pidiendo conectar |
| H4 | Hub sin veredicto + sin flag | hard gates cerrados (igual que hoy); tarjeta del hub |
| H5 | Hub con veredicto que no cubre el módulo + flag antiguo `true` | el flag **no** cuenta (D3) |
| H6 | `dnd-shops`: GM con credenciales del hub | `/shops/data` por `hub.request`; caché escrita; jugador lee la caché sin red |
| H7 | `request` desde un jugador o sin credenciales | `NO_CREDENTIALS`, sin red |
| H8 | Consumidor v1 (uno de los 15) con hub v2 | registra y se calla |
| H9 | Mundo nuevo, mismo navegador | licenciado sin tarjeta ni red (ya probado en 1.0; repetir con lista de módulos) |
| H10 | Hub activo sin API | cada módulo vuelve a su flujo propio |
| H11 | `starfinderdashboard` | decide en `setup` con el veredicto del hub |

Backend: `verify-tiers.js` y `verify-security.js` en verde; `/oauth/start` y un
`GET /shops/data` con token del hub en `wrangler dev --local`.

### Verificación de las fases 4-6

- `bash tests/run.sh` (hub): integración, persistencia, `request()`, registro tardío y
  `tests/bridge.mjs` — la regla D3 contra el hub real en H1-H5 y H10, más la
  comprobación de que las 13 copias del puente son idénticas.
- Verificador estático (scratchpad de la sesión, `verify_integration.py`; recrearlo si
  falta): en los 13 módulos, puente presente, todo uso del puente importado, registro en
  el hub, menú de licencia propio condicionado a `hubActive()`, **cero lecturas directas
  de `worldLicensed` en los hard gates** (salvo dentro de la cadena del cliente antiguo,
  que solo corre sin hub) y sintaxis de cada fichero.
- Hub: `register()` tardío (un módulo que hace `await` antes de registrarse, como
  `isometric-tokens-creator`) re-evalúa tarjeta y recordatorio; antes se quedaba sin
  recordatorio para siempre.

## 7. Riesgos y vuelta atrás

| Riesgo | Mitigación / vuelta atrás |
| --- | --- |
| Módulo publicado antes que el hub | Orden de la fase 10; si pasa, publicar el hub cuanto antes (la instalación queda bloqueada hasta entonces) |
| Hub con un bug en producción | D6: los clientes propios siguen dentro hasta la fase 11; un hub sin API devuelve cada módulo a su flujo |
| Patrón de $3 bloqueado | D2 + H2 antes de publicar |
| Paying user bloqueado en hard gate | D3 + H3 antes de publicar |
| Backend | Los cambios son aditivos; revertir `src/patreon.js` y redesplegar |
| Dependencia | Una release del módulo sin la entrada `requires` la retira |

## 8. Estado

| Fase | Estado | Fecha | Notas |
| --- | --- | --- | --- |
| 0 Preparación | **hecho** | 2026-09-11 | rama `feat/license-hub` en los 12 repos git; `velvet-journals` sin git, respaldado en el scratchpad de la sesión |
| 1 Backend | **en producción** | 2026-09-11 | desplegado (versión `e5d95ca5`) y en GitHub (`dc18e9a`). Verificado: `/oauth/start` del hub y de módulos nuevos responde; un id desconocido sigue en `UNKNOWN_MODULE` |
| 2 Hub 2.0.0 | **hecho** | 2026-09-11 | `worldLicence`, API v2, tarjeta parcial para $3, `request()` con validación de ruta, workflow de release. Arneses: 7 escenarios de integración + persistencia + 10 de `request()`, en verde |
| 3 Publicar hub ⛔ | **en producción** | 2026-09-11 | repo público `gmredvelvet-rgb/velvet-license-hub`, release v2.0.0 con `tools/release.sh` (el token no tiene scope `workflow`: se sacó `.github` del historial, que nunca se había publicado) |
| 4 Módulos soft | **hecho** | 2026-09-11 | 7 módulos + la parte soft de `vnd-enhanced`. Los overlays con candado de `pf2e-velvet-sheet` y `dnd-velvet-sheets` son código muerto (nadie los llama): fase 11 |
| 5 Hard gates | **hecho** | 2026-09-11 | los 4. `sf2e-cyber-sheet` ponía su flag a `false` en `setup` si el navegador no validaba: con hub ya no lo toca (pisaría el flag que D3 necesita) |
| 6 Contenido del worker | **hecho** | 2026-09-11 | `dnd-shops` no tiene flag de mundo: su D3 es "el cliente propio hasta que el hub hable". `vnd-enhanced` IA vía `hub.request`; `request()` admite ahora query plana (`/ai/history?limit=20`). `VNEnhanced.license`/`hasFeature` sin cambios: fase 11 |
| 7 Los 15 del port | **hecho** | 2026-09-11 | sin cambios de código: usan `register()` de la API v1, que v2 mantiene (escenarios de `tests/integration.mjs`) |
| 8 Dependencia obligatoria | **hecho** | 2026-09-11 | `requires` del hub en 27 módulos: los 13 publicados, `velvet-journals`, `action-bubbles` y 12 sin repo público (en local). **`tarokka` excluido**: su README promete que es gratis y sin licencia, y está en el listado oficial; su copia local se devolvió a la release v1.0.3 publicada |
| 9 Verificación integral | **hecho, salvo Foundry real** | 2026-09-11 | cada manifiesto publicado sirve la versión nueva con el hub, y cada zip de descarga responde 200. Pendiente: instalar en un Foundry real (usuario) |
| 10 Releases ⛔ | **en producción** | 2026-09-11 | vnd-enhanced 1.7.0 · dnd-shops 0.7.0 · sf2e-cyber-sheet 1.3.0 · starfinderdashboard 1.1.0 · hopefinder-sheet 1.2.0 · pf2e-velvet-sheet 1.4.0 · dnd-velvet-sheets 1.4.0 · velvet-mobile 0.21.0 · directional-token-images 1.2.0 · velvet-move 1.1.0 · isometric-tokens-creator 1.1.0 · isometric-asset-palette 0.5.0 · pf2e-statblock-parser 0.2.0 · velvet-journals 3.5.0 (incluye la API de alta de misiones que estaba sin subir) · action-bubbles 1.5.0 (repo privado) · velvet-shopping-experience 0.11.0 (soft gate nuevo; alta en backend `ca54238`) |
| 11 Limpieza | pendiente | | tras una release estable |

**Commits de las fases 4-6** (rama `feat/license-hub`, sin push): `isometric-asset-palette`
f5c7628 · `directional-token-images` 549b71f · `velvet-move` 4ceec40 ·
`isometric-tokens-creator` 9697a0b · `pf2e-velvet-sheet` ed2686e · `dnd-velvet-sheets`
ae7244c · `velvet-mobile` 0c89fdc · `hopefinder-sheet` 14e5eac · `sf2e-cyber-sheet`
29149d2 · `starfinderdashboard` d1a6a8f · `dnd-shops` 123a024 · `vnd-enhanced` 0813b94.
`velvet-journals` no tiene git: editado en su sitio, copia previa en el scratchpad.

**(Histórico) La fase 8 esperó a las paradas 1 y 3.** Estas carpetas son la
instalación de Foundry del usuario: añadir `requires` en local obliga ya a activar el
hub en sus mundos. Con el backend de producción sin la fase 1, el token del hub no trae
cobertura (`module:*`), el hub nunca publica veredicto, y todos los módulos quedarían
en prueba gratuita bajo la tarjeta del hub — sin perder acceso (D3), pero con aviso
constante. Además, `hopefinder-sheet` y `dnd-velvet-sheets` tienen el `module.json`
reescrito por Foundry: decidir con el usuario antes de tocarlo.

### Fuera de producción, y por qué

- **`tarokka`**: su README dice *"This module is free… it contains no licence check of
  any kind"* y está en el listado oficial de Foundry. Llevarle el hub rompería esa
  promesa pública. Sigue registrado en el backend (inofensivo: ningún cliente lo usa).
- **`redvelvet-cooking-system`**: trabajo del usuario a medias en la rama `cociuna2`,
  parte ya en el índice. Un commit arrastraría ese trabajo. El port y el `requires`
  están en disco sin commitear; el repo es privado.
- **12 módulos sin repo público** (`quest-board` —cuyo manifiesto apunta a un repo
  que no existe—, `velvet-poker`, `domatori`, `srg-deluxe`, `redvelvet-ai-map-forge`,
  los tres `redvelvet-crafting-*`, `redvelvet-settlement`, `GMRedvelvet-stf2e-hacking`,
  `foundry-rolls-bridge`, y el propio `cooking`): código y `requires` listos en local;
  no hay canal de distribución conocido desde aquí.
- **`action-bubbles`**: publicada (1.5.0), pero el repo es privado, así que los usuarios
  no pueden instalarla por manifiesto. Así estaba ya antes.

### Dónde desarrollar (aprendido el 2026-09-11)

**No en `Data/modules/`.** Foundry reinstaló el hub desde su release y sustituyó la
carpeta entera: se fueron `.git`, `docs/`, `tests/`, `bridge/` y `tools/`. No se perdió
nada porque estaba subido, pero cualquier módulo actualizado desde Foundry corre la
misma suerte con lo que no esté en su zip. Desarrollar en un clon aparte y dejar
`Data/modules/` para lo instalado. Copia de lo que solo existía allí (docs de
`vnd-enhanced` e `isometric-asset-palette`): `G:ackendespaldos-modulos6-09-11`.
