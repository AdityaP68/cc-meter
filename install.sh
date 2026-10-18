#!/bin/sh
# agent-lens installer for a git clone:  git clone <repo> && cd agent-lens && ./install.sh
# Builds the CLI and dashboard, registers this checkout as a local Claude Code plugin marketplace, installs the plugin,
# creates ~/.agent-lens, backfills your existing sessions and runs `agent-lens doctor`.
# Nothing here makes a network call except `npm ci` fetching build tools from the npm registry.
set -eu
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "agent-lens: '$1' is required but not installed" >&2; exit 1; }; }
need node
need npm

node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a<22 || (a===22 && b<13)) { console.error("agent-lens needs Node >= 22.13 (found "+process.versions.node+")"); process.exit(1) }'

echo "→ installing build dependencies (dev-only; agent-lens itself has no runtime dependencies)"
npm ci --no-audit --no-fund --loglevel=error
echo "→ building"
npm run --silent build
chmod +x dist/cli/index.js plugin/scripts/agent-lens.sh

echo "→ registering plugin and creating ~/.agent-lens"
node dist/cli/index.js setup "$@"

echo "→ doctor"
node dist/cli/index.js doctor || true

cat <<MSG

To use \`agent-lens\` from any shell, link it once:   npm link      (or add alias agent-lens="node $(pwd)/dist/cli/index.js")
Hooks work without that: they use the path recorded in ~/.agent-lens/cli-path.
MSG
