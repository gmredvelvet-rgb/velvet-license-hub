#!/usr/bin/env bash
# Publica una release del hub con gh, sin workflow de GitHub Actions.
#
#   bash tools/release.sh 2.0.0
#
# Por que no hay workflow: el token de gh de esta maquina no tiene el scope
# `workflow`, y GitHub rechaza cualquier push que cree o toque .github/workflows.
# Esto hace lo mismo que hacia el workflow: fija la version en module.json,
# empaqueta el modulo (sin docs/, tests/, bridge/ ni tools/) y sube module.zip y
# module.json a una release con el tag v<version>.
set -euo pipefail
VERSION="${1:?uso: tools/release.sh <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

current=$(node -e "console.log(require('./module.json').version)")
if [[ "$current" != "$VERSION" ]]; then
  echo "module.json dice $current, no $VERSION: sube la version y commitea antes." >&2
  exit 1
fi
if [[ -n "$(git -c safe.directory="$ROOT" status --porcelain)" ]]; then
  echo "Hay cambios sin commitear: la release tiene que salir de un commit." >&2
  exit 1
fi

bash tests/run.sh

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
# Solo lo que Foundry carga, con module.json en la raiz del zip.
python - "$ROOT" "$OUT/module.zip" <<'PY'
import os, sys, zipfile
root, out = sys.argv[1], sys.argv[2]
keep = ('module.json', 'README.md', 'CHANGELOG.md', 'scripts', 'styles', 'lang')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for entry in keep:
        path = os.path.join(root, entry)
        if os.path.isfile(path):
            z.write(path, entry)
        for base, _, files in os.walk(path):
            for f in files:
                full = os.path.join(base, f)
                z.write(full, os.path.relpath(full, root).replace(os.sep, '/'))
PY
cp module.json "$OUT/module.json"

notes=$(awk -v v="## $VERSION" '$0==v{f=1;next} /^## /{f=0} f' CHANGELOG.md)
gh release create "v$VERSION" "$OUT/module.zip" "$OUT/module.json" \
  --repo gmredvelvet-rgb/velvet-license-hub \
  --title "Velvet License Hub v$VERSION" \
  --notes "${notes:-Velvet License Hub v$VERSION}" \
  --target "$(git -c safe.directory="$ROOT" rev-parse HEAD)"
echo "Publicada v$VERSION"
