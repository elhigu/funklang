#!/usr/bin/env bash
# Build funklang and publish it to https://github.com/elhigu/funklang.mkael.net
# (which GitHub Pages serves at https://funklang.mkael.net).
#
# Layout:
#   funklang/dist/    — vite output, owned by vite (emptied on every build)
#   funklang/deploy/  — separate git repo whose 'main' is the published site
#
# Run from anywhere; this script always operates relative to its own dir.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -d deploy/.git ]]; then
  echo "deploy/.git missing — expected the funklang.mkael.net repo at funklang/deploy/" >&2
  exit 1
fi

# Release discipline (see AGENTS.md): the package.json version must have a matching
# entry in CHANGELOG.md before we publish. Bump the version + add a changelog
# section, then deploy.
VERSION="$(node -p "require('./package.json').version")"
if ! grep -q "## \[${VERSION}\]" CHANGELOG.md; then
  echo "Refusing to deploy: package.json is v${VERSION} but CHANGELOG.md has no '## [${VERSION}]' entry." >&2
  echo "Bump the version and add a dated changelog section first." >&2
  exit 1
fi
echo "→ Deploying v${VERSION}"

echo "→ Building..."
npm run build

echo "→ Syncing dist/ → deploy/ (preserving .git and CNAME)..."
rsync -a --delete --exclude=.git --exclude=CNAME dist/ deploy/

# CNAME must exist for GitHub Pages to keep serving the custom domain.
echo "funklang.mkael.net" > deploy/CNAME

cd deploy
git add -A
if git diff --cached --quiet; then
  echo "→ No changes to publish."
  exit 0
fi

MSG="${1:-Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)}"
git commit -m "$MSG"
git push origin main
echo "→ Pushed. https://funklang.mkael.net updates in ~1 min."
