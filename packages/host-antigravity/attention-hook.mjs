#!/usr/bin/env node
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

function finish() {
  process.stdout.write('{"decision":"stop"}\n')
}

try {
  const targetFile = process.argv[2]
  if (targetFile) {
    const raw = readFileSync(0, "utf8").trim()
    const payload = raw ? JSON.parse(raw) : {}
    if (payload?.terminationReason !== "USER_CANCELED") {
      mkdirSync(dirname(targetFile), { recursive: true, mode: 0o700 })
      const temp = `${targetFile}.${process.pid}.tmp`
      writeFileSync(
        temp,
        `${JSON.stringify({
          id: randomUUID(),
          conversationId: typeof payload?.conversationId === "string" ? payload.conversationId : "",
          reason: "reply",
          terminationReason:
            typeof payload?.terminationReason === "string" ? payload.terminationReason : "",
          at: Date.now(),
        })}\n`,
        { mode: 0o600 },
      )
      renameSync(temp, targetFile)
    }
  }
} catch {
  // Never block or error the host agent loop from an arcade attention hook.
} finally {
  finish()
}
