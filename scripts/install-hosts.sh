#!/usr/bin/env bash
set -euo pipefail

# Install both hosts locally. Rebuild them first:
#   npm run build:hosts
#
# Usage:
#   ./scripts/install-hosts.sh
#   AWAIT_ARCADE_API_URL=https://... ./scripts/install-hosts.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PLUGINS_DIR="${OPENCODE_PLUGINS_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins}"
GEMINI_DIR="${GEMINI_CONFIG_DIR:-$HOME/.gemini/config}"
SIDE="$GEMINI_DIR/sidecars/await-arcade"

# Validate the Antigravity config before touching anything.
if [[ -f "$GEMINI_DIR/config.json" ]]; then
  python3 - "$GEMINI_DIR/config.json" <<'PY'
import json
import sys

with open(sys.argv[1]) as source:
    config = json.load(source)
sidecars = config.get("sidecars")
if sidecars is not None and not isinstance(sidecars, dict):
    raise SystemExit("refusing: sidecars must be a JSON object")
entry = sidecars.get("await-arcade") if isinstance(sidecars, dict) else None
if entry is not None and not isinstance(entry, dict):
    raise SystemExit("refusing: sidecars.await-arcade must be a JSON object")
PY
fi

if [[ -L "$SIDE" ]]; then
  echo "Refusing: $SIDE is a symlink (an old manual install)." >&2
  echo "Remove it first: rm \"$SIDE\"" >&2
  exit 1
fi

mkdir -p "$PLUGINS_DIR"
TARGET="$PLUGINS_DIR/await-arcade"
if [[ -e "$TARGET" && ! -L "$TARGET" ]]; then
  echo "Refusing to replace $TARGET: it is not a symlink. Move it aside first." >&2
  exit 1
fi
ln -sfn "$ROOT/packages/host-opencode" "$TARGET"
echo "OpenCode plugin: $TARGET"

mkdir -p "$SIDE"
for file in server.mjs index.html app.js app.css; do
  src="$ROOT/packages/host-antigravity/$file"
  if [[ -e "$SIDE/$file" && "$SIDE/$file" -ef "$src" ]]; then
    continue
  fi
  ln -sfn "$src" "$SIDE/$file"
done

rm -f "$SIDE/sidecar.json"
cat > "$SIDE/sidecar.json" <<JSON
{
  "command": "node",
  "args": ["$SIDE/server.mjs"],
  "restart_policy": "always",
  "display_name": "Await Arcade",
  "description": "A tiny cross-host arcade.",
  "has_web_ui": true,
  "ui_config": {
    "display_name": "Await Arcade",
    "views": [
      {
        "title": "Await Arcade",
        "path": "/",
        "entrypoint": "SIDECAR_UI_ENTRYPOINT_AUX_PANE"
      }
    ]
  }
}
JSON
echo "Antigravity sidecar: $SIDE"

python3 - "$GEMINI_DIR" <<'PY'
import json
import os
import shutil
import sys
import uuid

root = sys.argv[1]
config_path = os.path.join(root, "config.json")
projects = os.path.join(root, "projects")

config = {}
if os.path.exists(config_path):
    backup = config_path + ".bak-await-arcade"
    if not os.path.exists(backup):
        shutil.copy2(config_path, backup)
    with open(config_path) as source:
        config = json.load(source)

sidecars = config.setdefault("sidecars", {})
if not isinstance(sidecars, dict):
    raise SystemExit("refusing: sidecars must be a JSON object")

entry = sidecars.get("await-arcade")
if entry is None:
    entry = {}
    sidecars["await-arcade"] = entry
if not isinstance(entry, dict):
    raise SystemExit("refusing: sidecars.await-arcade must be a JSON object")

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
                "name": "await-arcade",
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

if [[ -n "${AWAIT_ARCADE_API_URL:-}" ]]; then
  case "$(uname -s)" in
    Darwin)
      STATE_DIR="$HOME/Library/Application Support/await-arcade"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      STATE_DIR="${LOCALAPPDATA:-$HOME/AppData/Local}/await-arcade"
      ;;
    *)
      STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/await-arcade"
      ;;
  esac
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
  echo "API URL: $AWAIT_ARCADE_API_URL"
else
  echo "API URL: unchanged (set AWAIT_ARCADE_API_URL to write the state config)"
fi

echo
echo "Restart OpenCode and Antigravity. Look for Await Arcade in the plugin/sidecar lists."
