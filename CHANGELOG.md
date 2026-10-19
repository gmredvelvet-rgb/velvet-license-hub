# Changelog

## 2.0.1

- En Velvet Overlay 1.0.2 o posterior, «Conectar con Patreon» abre el navegador habitual y muestra el diálogo para pegar el código al regresar.
- Cancelar, introducir un código inválido o no poder abrir el navegador permite reintentar sin dejar el botón bloqueado.
- Se mantiene la conexión automática mediante ventana emergente en navegadores convencionales y el soft gate sin restricciones de funciones.
- Verificado con el cliente y la tarjeta reales en Electron; las respuestas de Patreon y Foundry se simulan sin iniciar sesión ni realizar pagos.

## 2.0.0

- **Cobertura por módulo.** La licencia del mundo pasa a ser `worldLicence =
  { until, modules }`: el tier de $3 licencia `velvet-mobile` y nada más, y la
  tarjeta distingue lo cubierto de lo que sigue en prueba.
- **API v2**: `isLicensed(moduleId)`, `hasVerdict()` y `request(method, path,
  body)` para que los módulos que reciben contenido del servidor (catálogo de
  tiendas, AI Studio) usen el token del hub sin llegar a verlo.
- `initialize()` memoizado: la primera `request()` de un módulo puede llegar antes
  que el `ready` del hub.
- Manifiesto con `manifest`/`download` y workflow de releases, para poder ser
  dependencia obligatoria del resto de módulos.

## 1.0.0

Primera versión.

- Una sola conexión de Patreon licencia todos los módulos que consultan el hub.
- Una sola tarjeta de prueba gratuita, con la lista de módulos cubiertos, en vez
  de una por módulo. Ninguna si no hay módulos compatibles activos en el mundo.
- Persistencia entre mundos: un navegador conectado licencia cualquier mundo del
  mismo servidor al abrirlo, sin preguntar.
- Licencia de mundo por fecha (`licensedUntil`), renovada sola mientras la
  suscripción siga activa y caducada sola si no.
- Fingerprint estable entre mundos, versiones de Foundry y monitores.
- API pública versionada (`apiVersion: 1`): `register`, `isLicensed`,
  `openLicenseCard`.
