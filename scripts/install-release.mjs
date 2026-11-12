#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto"
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir, platform } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  const value = args[index + 1]
  if (!value || value.startsWith("--")) fail(`${name} needs a value`)
  return value
}
function has(name) {
  return args.includes(name)
}
function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
function log(action, path) {
  console.log(dryRun ? `[dry-run] ${action}: ${path}` : `${action}: ${path}`)
}

if (has("--help") || has("-h")) {
  console.log(`Await Arcade installer

Usage:
  node install.mjs [options]

Options:
  --home <dir>            Install into a test home instead of the real home
  --api-url <url>         API base URL (default: https://api.awaitarcade.com)
  --opencode-only         Install only the OpenCode plugin
  --antigravity-only      Install only the Antigravity sidecar
  --force                 Replace an existing symlink or directory
  --uninstall             Remove the selected host installs
  --dry-run               Print actions without writing
  --verify                Verify files against SHA256SUMS before installing
`)
  process.exit(0)
}

const major = Number(process.versions.node.split(".")[0])
if (major < 22) fail(`Node.js 22 or newer is required (found ${process.versions.node})`)

const explicitHome = option("--home")
const home = explicitHome ? resolve(explicitHome) : homedir()
const apiUrl = option("--api-url", "https://api.awaitarcade.com")
const force = has("--force")
const dryRun = has("--dry-run")
const uninstall = has("--uninstall")
const onlyOpenCode = has("--opencode-only")
const onlyAntigravity = has("--antigravity-only")
const verify = has("--verify")
const stamp = new Date().toISOString().replace(/[:.]/g, "")

function configHome() {
  return explicitHome
    ? join(home, ".config")
    : process.env.XDG_CONFIG_HOME ?? join(home, ".config")
}
function stateDir() {
  if (process.env.AWAIT_ARCADE_STATE_DIR && !explicitHome) return process.env.AWAIT_ARCADE_STATE_DIR
  if (platform() === "darwin") return join(home, "Library", "Application Support", "await-arcade")
  if (platform() === "win32") return join(home, "AppData", "Local", "await-arcade")
  return join(process.env.XDG_STATE_HOME ?? join(home, ".local", "state"), "await-arcade")
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    fail(`refusing to modify invalid JSON: ${path}`)
  }
}

function writeJson(path, value, mode) {
  let target = path
  let existingMode
  try {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) {
      target = realpathSync(path)
      existingMode = statSync(target).mode & 0o777
    } else {
      existingMode = stat.mode & 0o777
    }
  } catch {
    // A missing file is fine; a dangling symlink is replaced with a file.
  }
  const body = `${JSON.stringify(value, null, 2)}\n`
  if (dryRun) {
    log("would write", path)
    return
  }
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  const temporary = `${target}.${randomUUID()}.tmp`
  writeFileSync(temporary, body, { mode: mode ?? existingMode ?? 0o600 })
  renameSync(temporary, target)
}

function copyTree(source, target, label) {
  if (!existsSync(source)) fail(`missing ${label}: ${source}`)
  let stat
  try {
    stat = lstatSync(target)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  if (dryRun) {
    log("installed", target)
    return
  }
  if (stat?.isSymbolicLink()) {
    if (!force) fail(`${target} is a symlink; rerun with --force to replace it`)
    rmSync(target, { force: true })
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    cpSync(source, target, { recursive: true, force: true })
  } else if (stat) {
    const backup = `${target}.bak-${stamp}`
    renameSync(target, backup)
    try {
      cpSync(source, target, { recursive: true, force: true })
      rmSync(backup, { recursive: true, force: true })
    } catch (error) {
      rmSync(target, { recursive: true, force: true })
      renameSync(backup, target)
      throw error
    }
  } else {
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    cpSync(source, target, { recursive: true, force: true })
  }
  log("installed", target)
}

function assertReplaceable(target, label) {
  let stat
  try {
    stat = lstatSync(target)
  } catch (error) {
    if (error.code === "ENOENT") return
    throw error
  }
  if (stat.isSymbolicLink() && !force) {
    fail(`${target} is a symlink; rerun with --force to replace it`)
  }
  if (!dryRun && existsSync(target)) log("replace existing", label)
}

function verifyChecksums() {
  const sumsPath = join(here, "SHA256SUMS")
  if (!existsSync(sumsPath)) fail("SHA256SUMS is missing from this release")
  const lines = readFileSync(sumsPath, "utf8").split("\n").filter(Boolean)
  for (const line of lines) {
    const [expected, relativePath] = line.split(/\s{2,}/)
    if (!expected || !relativePath) continue
    const file = join(here, relativePath)
    if (!existsSync(file)) fail(`checksum file missing: ${relativePath}`)
    const actual = createHash("sha256").update(readFileSync(file)).digest("hex")
    if (actual !== expected) fail(`checksum mismatch: ${relativePath}`)
  }
  console.log(`checksums verified: ${lines.length} files`)
}

const pluginsDir =
  explicitHome || !process.env.OPENCODE_PLUGINS_DIR
    ? join(configHome(), "opencode", "plugins")
    : process.env.OPENCODE_PLUGINS_DIR
const geminiDir =
  explicitHome || !process.env.GEMINI_CONFIG_DIR
    ? join(home, ".gemini", "config")
    : process.env.GEMINI_CONFIG_DIR
const pluginTarget = join(pluginsDir, "await-arcade")
const sidecarTarget = join(geminiDir, "sidecars", "await-arcade")
const configPath = join(geminiDir, "config.json")
const projectsDir = join(geminiDir, "projects")
const apiConfig = join(stateDir(), "config.json")

if (verify && !dryRun) verifyChecksums()

const installOpenCode = !onlyAntigravity
const installAntigravity = !onlyOpenCode
const sidecarData = join(sidecarTarget, ".data")

if (uninstall) {
  if (installOpenCode) {
    log("remove", pluginTarget)
    if (!dryRun) rmSync(pluginTarget, { recursive: true, force: true })
  }
  if (installAntigravity) {
    if (existsSync(sidecarData)) {
      const backup = join(stateDir(), `antigravity-data-${stamp}`)
      log("preserve sidecar data", backup)
      if (!dryRun) {
        mkdirSync(dirname(backup), { recursive: true, mode: 0o700 })
        renameSync(sidecarData, backup)
      }
    }
    log("remove", sidecarTarget)
    if (!dryRun) rmSync(sidecarTarget, { recursive: true, force: true })
    if (existsSync(configPath)) {
      const config = readJson(configPath, {})
      if (isPlainObject(config) && isPlainObject(config.sidecars)) {
        const projectId = config.sidecars["await-arcade"]?.projectId
        delete config.sidecars["await-arcade"]
        writeJson(configPath, config)
        if (typeof projectId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
          const projectPath = join(projectsDir, `${projectId}.json`)
          if (!dryRun) rmSync(projectPath, { force: true })
        }
      }
    }
  }
  console.log(dryRun ? "[dry-run] uninstall complete" : "Await Arcade removed. Local auth/state was left in place.")
  process.exit(0)
}

if (installAntigravity && platform() !== "darwin") {
  console.warn("warning: the Antigravity sidecar SDK is currently macOS-first; this install may not start.")
}

let antigravityConfig
let antigravityProjectId

if (installAntigravity) {
  // Validate host config before touching either host installation.
  antigravityConfig = readJson(configPath, {})
  if (!isPlainObject(antigravityConfig)) {
    fail("refusing to modify config.json: expected an object")
  }
  if (antigravityConfig.sidecars !== undefined && !isPlainObject(antigravityConfig.sidecars)) {
    fail("refusing to modify config.json: sidecars must be an object")
  }
  antigravityConfig.sidecars ??= {}
  const entry = antigravityConfig.sidecars["await-arcade"]
  if (entry !== undefined && !isPlainObject(entry)) {
    fail("refusing to modify config.json: sidecars.await-arcade must be an object")
  }
  const next = entry ?? {}
  antigravityProjectId =
    typeof next.projectId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(next.projectId)
      ? next.projectId
      : randomUUID()
  antigravityConfig.sidecars["await-arcade"] = {
    ...next,
    enabled: true,
    projectId: antigravityProjectId,
    schemaVersion: 1,
  }
}

if (installOpenCode) {
  copyTree(join(here, "opencode"), pluginTarget, "OpenCode plugin")
}

if (installAntigravity) {
  if (!existsSync(join(here, "antigravity"))) fail("missing Antigravity sidecar files")
  assertReplaceable(sidecarTarget, "Antigravity sidecar")

  let dataBackup
  if (!dryRun && existsSync(sidecarData)) {
    dataBackup = `${sidecarTarget}.data.bak-${stamp}`
    renameSync(sidecarData, dataBackup)
  }
  try {
    copyTree(join(here, "antigravity"), sidecarTarget, "Antigravity sidecar")
    if (dataBackup) renameSync(dataBackup, join(sidecarTarget, ".data"))
  } catch (error) {
    if (dataBackup && existsSync(dataBackup)) {
      if (!existsSync(sidecarTarget)) mkdirSync(sidecarTarget, { recursive: true, mode: 0o700 })
      renameSync(dataBackup, join(sidecarTarget, ".data"))
    }
    throw error
  }

  const sidecar = readJson(join(here, "antigravity", "sidecar.json.example"), {})
  sidecar.command = "node"
  sidecar.args = [join(sidecarTarget, "server.mjs")]
  sidecar.restart_policy = "always"
  writeJson(join(sidecarTarget, "sidecar.json"), sidecar)
  if (!dryRun) rmSync(join(sidecarTarget, "sidecar.json.example"), { force: true })

  if (!dryRun && existsSync(configPath)) {
    const backup = `${configPath}.bak-await-arcade`
    if (!existsSync(backup)) cpSync(configPath, backup, { dereference: true })
  }
  writeJson(configPath, antigravityConfig)

  const projectPath = join(projectsDir, `${antigravityProjectId}.json`)
  if (!existsSync(projectPath)) {
    writeJson(projectPath, {
      id: antigravityProjectId,
      name: "await-arcade",
      projectResources: {},
      permissionGrants: { permissionGrants: {} },
      settings: { artifactReviewMode: "ARTIFACT_REVIEW_MODE_TURBO" },
    })
  }
  log("enabled Antigravity sidecar", sidecarTarget)
}

const existing = readJson(apiConfig, {})
writeJson(apiConfig, { ...existing, apiUrl }, 0o600)
log("API URL", apiUrl)

console.log("")
console.log("Installed Await Arcade.")
if (installOpenCode) console.log(`OpenCode plugin: ${pluginTarget}`)
if (installAntigravity) console.log(`Antigravity sidecar: ${sidecarTarget}`)
console.log("Reload OpenCode and reopen the Antigravity pane.")
