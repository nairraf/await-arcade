import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const version = process.env.RELEASE_VERSION ?? "0.2.0"
const releaseName =
  process.env.RELEASE_NAME ??
  (version === "0.2.0" ? "await-arcade-beta-2" : `await-arcade-${version}`)
const releaseRoot = resolve(root, "dist-release")
const out = resolve(releaseRoot, releaseName)

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`invalid RELEASE_VERSION: ${version}`)
}
if (
  !releaseName ||
  !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(releaseName) ||
  basename(out) !== releaseName ||
  dirname(out) !== releaseRoot
) {
  throw new Error(`invalid RELEASE_NAME: ${releaseName}`)
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: "inherit", ...options })
}

function copy(source, target) {
  if (!existsSync(source)) throw new Error(`missing release input: ${source}`)
  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target, { recursive: true, force: true })
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:hosts"])

const opencode = join(out, "opencode")
mkdirSync(opencode, { recursive: true })
copy(join(root, "packages/host-opencode/dist/server.js"), join(opencode, "server.js"))
copy(join(root, "packages/host-opencode/gui-experimental.cjs"), join(opencode, "gui-experimental.cjs"))
writeFileSync(
  join(opencode, "package.json"),
  `${JSON.stringify(
    {
      name: "await-arcade-opencode",
      version,
      private: true,
      type: "module",
      exports: {
        ".": "./server.js",
        "./gui-experimental": "./gui-experimental.cjs",
      },
    },
    null,
    2,
  )}\n`,
)

const antigravity = join(out, "antigravity")
mkdirSync(antigravity, { recursive: true })
copy(join(root, "packages/host-antigravity/dist-server/server.mjs"), join(antigravity, "server.mjs"))
copy(join(root, "packages/host-antigravity/index.html"), join(antigravity, "index.html"))
writeFileSync(
  join(antigravity, "sidecar.json.example"),
  `${JSON.stringify(
    {
      command: "node",
      args: ["server.mjs"],
      restart_policy: "always",
      display_name: "Await Arcade",
      description: "A tiny arcade for the wait.",
      has_web_ui: true,
      ui_config: {
        display_name: "Await Arcade",
        views: [
          {
            title: "Await Arcade",
            path: "/",
            entrypoint: "SIDECAR_UI_ENTRYPOINT_AUX_PANE",
          },
        ],
      },
    },
    null,
    2,
  )}\n`,
)

copy(join(root, "scripts/install-release.mjs"), join(out, "install.mjs"))
copy(join(root, "README.md"), join(out, "README.md"))
copy(join(root, "LICENSE"), join(out, "LICENSE"))
writeFileSync(join(out, "VERSION"), `${version}\n`)

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else if (entry.isFile()) files.push(path)
  }
  return files.sort()
}

const sums = walk(out)
  .filter((path) => !path.endsWith("SHA256SUMS"))
  .map((path) => {
    const hash = createHash("sha256").update(readFileSync(path)).digest("hex")
    return `${hash}  ${relative(out, path).split("\\").join("/")}`
  })
  .join("\n")
writeFileSync(join(out, "SHA256SUMS"), `${sums}\n`)

const tarball = join(releaseRoot, `${releaseName}.tar.gz`)
rmSync(tarball, { force: true })
rmSync(`${tarball}.sha256`, { force: true })
run("tar", ["-czf", tarball, "-C", releaseRoot, "--", releaseName])
const tarballHash = createHash("sha256").update(readFileSync(tarball)).digest("hex")
writeFileSync(`${tarball}.sha256`, `${tarballHash}  ${releaseName}.tar.gz\n`)

const size = statSync(tarball).size
console.log(`release ${version}`)
console.log(`${out}`)
console.log(`${tarball} (${(size / 1024 / 1024).toFixed(1)} MB)`)
console.log(`${tarball}.sha256`)
