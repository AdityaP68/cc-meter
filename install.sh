#!/bin/sh
# ccmeter installer for a git clone:  git clone <repo> && cd ccmeter && ./install.sh
# Builds the CLI and dashboard, registers this checkout as a local Claude Code plugin marketplace, installs the plugin,
# creates ~/.ccmeter, backfills your existing sessions and runs `ccmeter doctor`.
# Nothing here makes a network call except `npm ci` fetching build tools from the npm registry.
set -eu
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ccmeter: '$1' is required but not installed" >&2; exit 1; }; }
need node
need npm

node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a<22 || (a===22 && b<13)) { console.error("ccmeter needs Node >= 22.13 (found "+process.versions.node+")"); process.exit(1) }'

echo "→ installing build dependencies (dev-only; ccmeter itself has no runtime dependencies)"
npm ci --no-audit --no-fund --loglevel=error
echo "→ building"
npm run --silent build
chmod +x dist/cli/index.js plugin/scripts/ccmeter.sh

echo "→ registering plugin and creating ~/.ccmeter"
node dist/cli/index.js setup "$@"

echo "→ doctor"
node dist/cli/index.js doctor || true

cat <<MSG

To use \`ccmeter\` from any shell, link it once:   npm link      (or add alias ccmeter="node $(pwd)/dist/cli/index.js")
Hooks work without that: they use the path recorded in ~/.ccmeter/cli-path.
MSG
