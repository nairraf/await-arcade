import { createHash } from "node:crypto"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const siteDir = join(root, "site")
const firebase = JSON.parse(readFileSync(join(root, "firebase.json"), "utf8"))
const hosting = firebase.hosting
const site = process.env.FIREBASE_SITE ?? "await-arcade"
const token = process.env.FIREBASE_ACCESS_TOKEN
const dryRun = process.env.HOSTING_DRY_RUN === "1"

if (!hosting || typeof hosting !== "object") {
  throw new Error("firebase.json is missing the hosting object")
}
if (hosting.public !== "site") {
  throw new Error(`firebase.json hosting.public must be "site", got ${hosting.public}`)
}

const allowedHostingKeys = new Set([
  "public",
  "ignore",
  "headers",
  "rewrites",
  "redirects",
  "cleanUrls",
  "trailingSlash",
])
for (const key of Object.keys(hosting)) {
  if (!allowedHostingKeys.has(key)) {
    throw new Error(`deploy-hosting.mjs does not handle hosting.${key}`)
  }
}

const knownIgnore = new Set([
  "firebase.json",
  "**/.*",
  "**/node_modules/**",
  "**/.DS_Store",
])
for (const pattern of hosting.ignore ?? []) {
  if (!knownIgnore.has(pattern)) {
    throw new Error(`deploy-hosting.mjs does not handle hosting.ignore pattern: ${pattern}`)
  }
}

const api = "https://firebasehosting.googleapis.com/v1beta1"

async function call(path, init = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(60_000),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  })
  const text = await response.text()
  let body = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    // Fall through to the status check with the raw body below.
  }
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status}: ${text.slice(0, 500)}`)
  }
  return body
}

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue
    if (entry.isSymbolicLink()) {
      throw new Error(`refusing to deploy symlink: ${join(dir, entry.name)}`)
    }
    if (entry.isDirectory()) files.push(...walk(join(dir, entry.name)))
    else if (entry.isFile()) files.push(join(dir, entry.name))
  }
  return files.sort()
}

const upload = walk(siteDir).map((path) => {
  const relativePath = `/${relative(siteDir, path).split("\\").join("/")}`
  const gz = gzipSync(readFileSync(path), { level: 9 })
  return {
    path: relativePath,
    hash: createHash("sha256").update(gz).digest("hex"),
    gz,
    bytes: gz.length,
  }
})

const config = {
  headers: (hosting.headers ?? []).map((entry) => ({
    glob: entry.source,
    headers: Object.fromEntries(entry.headers.map(({ key, value }) => [key, value])),
  })),
  rewrites: (hosting.rewrites ?? []).map((rule) => ({
    glob: rule.source,
    ...(rule.destination ? { path: rule.destination } : {}),
    ...(rule.run ? { run: rule.run } : {}),
  })),
  ...(hosting.redirects
    ? {
        redirects: hosting.redirects.map((rule) => ({
          glob: rule.source,
          location: rule.destination,
          statusCode: rule.type,
        })),
      }
    : {}),
  ...(hosting.cleanUrls !== undefined ? { cleanUrls: hosting.cleanUrls } : {}),
  ...(hosting.trailingSlash !== undefined
    ? { trailingSlashBehavior: hosting.trailingSlash ? "ADD" : "REMOVE" }
    : {}),
}

if (dryRun) {
  console.log(JSON.stringify({ site, files: upload.map(({ path, bytes }) => ({ path, bytes })), config }, null, 2))
  process.exit(0)
}

if (!token) {
  throw new Error("set FIREBASE_ACCESS_TOKEN to an OAuth access token")
}

const version = await call(`/sites/${site}/versions`, {
  method: "POST",
  body: JSON.stringify({ config }),
})
const versionId = version.name.split("/").pop()
console.log(`version ${versionId}: ${upload.length} files`)

const populated = await call(`/sites/${site}/versions/${versionId}:populateFiles`, {
  method: "POST",
  body: JSON.stringify({
    files: Object.fromEntries(upload.map((file) => [file.path, file.hash])),
  }),
})

const byHash = new Map(upload.map((file) => [file.hash, file]))
const uploadUrl = populated.uploadUrl
for (const hash of populated.uploadRequiredHashes ?? []) {
  const file = byHash.get(hash)
  if (!file) throw new Error(`missing upload body for ${hash}`)
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${uploadUrl}/${hash}`, {
        method: "POST",
        signal: AbortSignal.timeout(120_000),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/octet-stream",
        },
        body: file.gz,
      })
      if (response.ok) {
        lastError = undefined
        break
      }
      lastError = new Error(`upload ${file.path} -> ${response.status}: ${await response.text()}`)
    } catch (error) {
      lastError = error
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
  }
  if (lastError) throw lastError
  console.log(`uploaded ${file.path}`)
}

await call(`/sites/${site}/versions/${versionId}?updateMask=status`, {
  method: "PATCH",
  body: JSON.stringify({ status: "FINALIZED" }),
})

const release = await call(`/sites/${site}/releases?versionName=sites/${site}/versions/${versionId}`, {
  method: "POST",
  body: JSON.stringify({}),
})
console.log(`released ${release.name}`)
console.log(`https://${site}.web.app`)
