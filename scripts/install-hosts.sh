#!/usr/bin/env bash
set -euo pipefail

# Install both hosts locally. Rebuild them first:
#   npm run build:hosts
#   npm run build:hosts:dev    # when using --dev
#
# Usage:
#   ./scripts/install-hosts.sh [--dev]
#   AWAIT_ARCADE_API_URL=https://... ./scripts/install-hosts.sh [--dev]

DEV=0
for arg in "$@"; do
  case "$arg" in
    --dev)
      DEV=1
      ;;
    -h|--help)
      echo "Usage: ./scripts/install-hosts.sh [--dev]"
      echo "  --dev   Install side-by-side as await-arcade-dev (Await Arcade (Dev))"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: ./scripts/install-hosts.sh [--dev]" >&2
      exit 1
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$DEV" -eq 1 ]]; then
  APP_ID="await-arcade-dev"
  DISPLAY_NAME="Await Arcade (Dev)"
  OPENCODE_SRC="$ROOT/packages/host-opencode/.dev"
  if [[ ! -f "$OPENCODE_SRC/server.js" || ! -f "$OPENCODE_SRC/gui-experimental.cjs" ]]; then
    echo "Dev OpenCode bundle missing under $OPENCODE_SRC." >&2
    echo "Run first: npm run build:hosts:dev" >&2
    exit 1
  fi
else
  APP_ID="await-arcade"
  DISPLAY_NAME="Await Arcade"
  OPENCODE_SRC="$ROOT/packages/host-opencode"
fi

PLUGINS_DIR="${OPENCODE_PLUGINS_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins}"
GEMINI_DIR="${GEMINI_CONFIG_DIR:-$HOME/.gemini/config}"
SIDE="$GEMINI_DIR/sidecars/$APP_ID"

# Validate the Antigravity config before touching anything.
if [[ -f "$GEMINI_DIR/config.json" ]]; then
  python3 - "$GEMINI_DIR/config.json" "$APP_ID" <<'PY'
import json
import sys

config_path, app_id = sys.argv[1], sys.argv[2]
with open(config_path) as source:
    config = json.load(source)
sidecars = config.get("sidecars")
if sidecars is not None and not isinstance(sidecars, dict):
    raise SystemExit("refusing: sidecars must be a JSON object")
entry = sidecars.get(app_id) if isinstance(sidecars, dict) else None
if entry is not None and not isinstance(entry, dict):
    raise SystemExit(f"refusing: sidecars.{app_id} must be a JSON object")
PY
fi

if [[ -L "$SIDE" ]]; then
  echo "Refusing: $SIDE is a symlink (an old manual install)." >&2
  echo "Remove it first: rm \"$SIDE\"" >&2
  exit 1
fi

mkdir -p "$PLUGINS_DIR"
TARGET="$PLUGINS_DIR/$APP_ID"
if [[ -e "$TARGET" && ! -L "$TARGET" ]]; then
  echo "Refusing to replace $TARGET: it is not a symlink. Move it aside first." >&2
  exit 1
fi
ln -sfn "$OPENCODE_SRC" "$TARGET"
# OpenCode preserves the plugin symlink when resolving imports, so give the
# package its own node_modules link into the workspace root.
ln -sfn "$ROOT/node_modules" "$OPENCODE_SRC/node_modules"
echo "OpenCode plugin ($DISPLAY_NAME): $TARGET"

mkdir -p "$SIDE"
for file in server.mjs index.html app.js app.css; do
  src="$ROOT/packages/host-antigravity/$file"
  if [[ -e "$SIDE/$file" && "$SIDE/$file" -ef "$src" ]]; then
    continue
  fi
  ln -sfn "$src" "$SIDE/$file"
done

if [[ "$DEV" -eq 1 ]]; then
  ARGS_JSON="[\"$SIDE/server.mjs\", \"--state-name\", \"$APP_ID\"]"
else
  ARGS_JSON="[\"$SIDE/server.mjs\"]"
fi

rm -f "$SIDE/sidecar.json"
cat > "$SIDE/sidecar.json" <<JSON
{
  "command": "node",
  "args": $ARGS_JSON,
  "restart_policy": "always",
  "display_name": "$DISPLAY_NAME",
  "description": "A tiny cross-host arcade.",
  "has_web_ui": true,
  "ui_config": {
    "display_name": "$DISPLAY_NAME",
    "views": [
      {
        "title": "$DISPLAY_NAME",
        "path": "/",
        "entrypoint": "SIDECAR_UI_ENTRYPOINT_AUX_PANE"
      }
    ]
  }
}
JSON
echo "Antigravity sidecar ($DISPLAY_NAME): $SIDE"

python3 - "$GEMINI_DIR" "$APP_ID" <<'PY'
import json
import os
import shutil
import sys
import uuid

root, app_id = sys.argv[1], sys.argv[2]
config_path = os.path.join(root, "config.json")
projects = os.path.join(root, "projects")

config = {}
if os.path.exists(config_path):
    backup = config_path + f".bak-{app_id}"
    if not os.path.exists(backup):
        shutil.copy2(config_path, backup)
    with open(config_path) as source:
        config = json.load(source)

sidecars = config.setdefault("sidecars", {})
if not isinstance(sidecars, dict):
    raise SystemExit("refusing: sidecars must be a JSON object")

entry = sidecars.get(app_id)
if entry is None:
    entry = {}
    sidecars[app_id] = entry
if not isinstance(entry, dict):
    raise SystemExit(f"refusing: sidecars.{app_id} must be a JSON object")

project_id = entry.get("projectId")
if not project_id:
    project_id = str(uuid.uuid4())
entry.update({"enabled": True, "projectId": project_id, "schemaVersion": 1})

os.makedirs(projects, exist_ok=True)
project_path = os.path.join(projects, project_id + ".json")
if not os.path.exists(project_path):
    with open(project_path, "w") as target:
        json.dump(
            {
                "id": project_id,
                "name": app_id,
                "projectResources": {},
                "permissionGrants": {"permissionGrants": {}},
                "settings": {"artifactReviewMode": "ARTIFACT_REVIEW_MODE_TURBO"},
            },
            target,
            indent=2,
        )
        target.write("\n")
print("Antigravity project:", project_id)

temporary = config_path + f".{os.getpid()}.tmp"
with open(temporary, "w") as target:
    json.dump(config, target, indent=2)
    target.write("\n")
    target.flush()
    os.fsync(target.fileno())
os.replace(temporary, config_path)
PY

case "$(uname -s)" in
  Darwin)
    STATE_DIR="$HOME/Library/Application Support/$APP_ID"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    STATE_DIR="${LOCALAPPDATA:-$HOME/AppData/Local}/$APP_ID"
    ;;
  *)
    STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/$APP_ID"
    ;;
esac

if [[ -n "${AWAIT_ARCADE_API_URL:-}" ]]; then
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  python3 - "$STATE_DIR/config.json" "$AWAIT_ARCADE_API_URL" <<'PY'
import json
import os
import sys

path, api_url = sys.argv[1], sys.argv[2]
temporary = path + f".{os.getpid()}.tmp"
with open(temporary, "w") as target:
    json.dump({"apiUrl": api_url}, target)
    target.write("\n")
    target.flush()
    os.fsync(target.fileno())
os.replace(temporary, path)
os.chmod(path, 0o600)
PY
  echo "API URL ($STATE_DIR): $AWAIT_ARCADE_API_URL"
else
  echo "API URL ($STATE_DIR): unchanged (set AWAIT_ARCADE_API_URL to write the state config)"
fi

echo
echo "Restart OpenCode and Antigravity. Look for $DISPLAY_NAME in the plugin/sidecar lists."
