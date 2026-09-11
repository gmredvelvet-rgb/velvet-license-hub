# Velvet License Hub

Una sola conexión de Patreon para todos los módulos de GM RedVelvet.

Sin el hub, cada módulo lleva su propio *soft gate*: su propia tarjeta de prueba
gratuita, su propio botón de Patreon, su propia activación. Con quince módulos en
un mundo, son quince conexiones. Con el hub activo, los módulos compatibles le
ceden la licencia: **se conecta una vez, en el hub, y quedan todos activados**.

Como en todo el soft gate de la familia, **ninguna función se bloquea jamás**. Sin
licencia, todo sigue funcionando y solo aparece un recordatorio de la prueba
gratuita — uno, el del hub, no uno por módulo.

## Qué ve cada uno

| Situación | Resultado |
| --- | --- |
| Hub activo y mundo licenciado | Silencio total. Ningún módulo pregunta nada. |
| Hub activo, sin licencia | **Una** tarjeta, la del hub, con la lista de módulos en prueba. Recordatorio cada 5 min. |
| Hub activo, ningún módulo compatible en el mundo | Nada: no hay prueba que recordar. |
| Sin hub | Cada módulo con su prueba gratuita y su propia activación, como siempre. |
| Jugadores | Variante informativa, sin botones. Nunca contactan el servidor. |

La licencia se gestiona en *Configurar ajustes → Velvet License Hub → Licencia de
Patreon*. Con el hub activo, los módulos compatibles no registran su propio menú de
licencia, para no llenar los ajustes de entradas repetidas.

## Persistencia

La validación se hace una vez y dura, en tres capas:

1. **El navegador del GM guarda las credenciales**, y las comparte con todos los
   mundos del mismo servidor. Abrir otro mundo desde ese navegador lo licencia al
   instante: sin tarjeta, sin volver a Patreon.
2. **Cada mundo guarda hasta cuándo está licenciado** (`licensedUntil`). Otro
   navegador u ordenador que entre en un mundo ya licenciado no pregunta nada.
3. **La fecha se renueva sola.** Mientras la suscripción siga activa, el latido
   periódico la empuja 30 días hacia delante. Si se cancela, nadie la renueva y
   el recordatorio vuelve cuando caduca — no antes.

Solo hay que volver a conectar si se da todo a la vez: un navegador sin
credenciales, en un mundo cuya fecha ya caducó.

## Para módulos: cómo consultar el hub

La API vive en `game.modules.get("velvet-license-hub").api`:

| Miembro | Uso |
| --- | --- |
| `apiVersion` | `1`. Exige `>= 1`; cualquier otra cosa cuenta como "no hay hub". |
| `register(moduleId)` | Declara que tu módulo está cubierto en este mundo. Llamar en `ready`, **antes de cualquier `await`**. |
| `isLicensed()` | Si el mundo está licenciado ahora mismo. |
| `openLicenseCard()` | Abre la tarjeta del hub, p. ej. desde un botón de tu módulo. |

El patrón que usan los módulos de la familia (`scripts/license/boot.js`):

```js
const HUB_ID = "velvet-license-hub";

function licenseHub() {
  const hub = game.modules.get(HUB_ID);
  return (hub?.active && (hub.api?.apiVersion >= 1)) ? hub.api : null;
}

Hooks.once("init", () => {
  // ...registrar el setting propio...
  // En init solo se sabe si el hub esta activo; su API llega en su propio init.
  if ( !game.modules.get(HUB_ID)?.active ) game.settings.registerMenu(/* menu propio */);
});

Hooks.once("ready", async () => {
  if ( game.view !== "game" ) return;
  const hub = licenseHub();
  if ( hub ) {
    hub.register(MODULE_ID);   // antes de cualquier await
    return;                    // el hub se encarga: ni servidor, ni tarjeta propia
  }
  // ...flujo de licencia propio del modulo...
});
```

Un hub activo pero roto (sin API) cuenta como ausente: el módulo vuelve a su flujo
propio. Mejor una tarjeta de más que un módulo que no pregunta nunca.

## Backend

El hub es un módulo más del catálogo de `velvet-license-backend`
(`src/patreon.js → MODULE_FEATURES['velvet-license-hub']`): instalación propia con
sus 2 plazas, abierto a los tiers Supporter ($6) y superiores. El tier de $3 solo
abre `velvet-mobile`, así que un hub no tendría nada que consolidar.

## Decisiones de diseño

Cada una responde a un fallo real o a un riesgo concreto. Al tocar el hub, no
"simplificar" ninguna.

- **Las credenciales nunca salen del `localStorage` del GM.** Los settings de mundo
  se envían a todos los jugadores, y el token de acceso es una credencial *bearer*
  que también gasta la cuota de AI Studio del dueño. Al mundo solo llega una fecha.
- **La licencia del mundo es una fecha, no un booleano.** Un booleano era pegajoso:
  una vez en `true`, solo el navegador con los tokens podía volver a apagarlo. Una
  fecha caduca sola, y no necesita ningún camino de fallo que la limpie.
- **La fecha nunca se acorta**, y solo se reescribe si gana al menos un día: cada
  escritura de un setting de mundo se difunde a todos los clientes conectados.
- **El fingerprint es estable entre mundos.** La implementación de referencia
  metía el id del mundo, la versión de Foundry, el tamaño de pantalla y un render
  de canvas. Como `localStorage` es compartido por todos los mundos del servidor,
  abrir un segundo mundo, actualizar Foundry o cambiar de monitor presentaba otro
  fingerprint en el siguiente refresh, y el servidor revocaba las credenciales como
  robadas. Ahora es el hash del id de instalación, que vive junto al refresh token
  que protege: quien pueda leer uno puede leer el otro.
- **El hub espera un tick antes de decidir si muestra la tarjeta**, para que todos
  los módulos hayan hecho su `register()` desde sus propios `ready`.
- **La API se publica en `init`**, para que exista antes de cualquier `ready`.

El resto — refresh serializado, tarjeta que no es un `DialogV2`, popup bloqueado,
código de un solo uso que viaja en el error, `licenseMenuClass()` perezoso — viene
tal cual de la implementación de referencia; ver `docs/SOFT-GATE.md` en
`isometric-asset-palette`.
