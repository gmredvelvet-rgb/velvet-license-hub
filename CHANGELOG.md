# Changelog

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
