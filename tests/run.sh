#!/usr/bin/env bash
# Ejecuta todos los arneses del hub. Sin red: todo corre sobre un Foundry simulado.
#
#   bash tests/run.sh
#
# FOUNDRY_MODULES apunta a la carpeta de modulos (por defecto I:/Foundry_Data/Data/modules).
# Sale con codigo distinto de 0 si algo falla.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
HUB="$(cd "$HERE/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fails=0
quiet() { grep -v -e Warning -e Reparsing -e eliminate -e trace-warnings; }

# Copia del hub con una clave RSA de pruebas, para poder firmar tokens aqui.
node -e "
const {generateKeyPairSync}=require('crypto');
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
require('fs').writeFileSync(process.argv[1],JSON.stringify({
  publicKey: publicKey.export({type:'spki',format:'der'}).toString('base64url'),
  privateKey: privateKey.export({type:'pkcs8',format:'der'}).toString('base64url')}));
" "$WORK/test-keys.json"
cp -r "$HUB" "$WORK/hub"
PUB=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1])).publicKey)" "$WORK/test-keys.json")
sed -i "s|const RSA_PUBLIC_KEY = \"[^\"]*\"|const RSA_PUBLIC_KEY = \"$PUB\"|" "$WORK/hub/scripts/license.js"

expect() { # escenario, fragmento JSON esperado
  out=$(node "$HERE/integration.mjs" "$1" 2>&1 | quiet | tail -1)
  if [[ "$out" == *"$2"* ]]; then echo "  ok    $1"; else echo "  FALLO $1 -> $out"; fails=$((fails+1)); fi
}
echo "== integracion"
expect hub-trial     '"cards":["velvet-license-hub-card"]'
expect hub-licensed  '"cards":[]'
expect hub-mobile    '"partial":true,"listsMobile":false'
expect hub-empty     '"cards":[]'
expect no-hub        '"cards":["tarokka-license-card","action-bubbles-license-card"]'
expect hub-broken    '"cards":["tarokka-license-card","action-bubbles-license-card"]'
expect player        '"cards":[],'

for s in second-world request request-nocreds; do
  echo "== $s"
  node "$HERE/persistence.mjs" "$WORK/hub" "$s" 2>&1 | quiet || fails=$((fails+1))
done

echo "== fingerprint entre mundos"
a=$(node "$HERE/persistence.mjs" "$WORK/hub" fingerprint mundo-a 2>/dev/null)
b=$(node "$HERE/persistence.mjs" "$WORK/hub" fingerprint otra-campana 2>/dev/null)
if [[ -n "$a" && "$a" == "$b" ]]; then echo "  ok    identico"; else echo "  FALLO $a / $b"; fails=$((fails+1)); fi

echo; [[ $fails -eq 0 ]] && echo "Todo en verde." || echo "$fails fallo(s)."
exit $fails
