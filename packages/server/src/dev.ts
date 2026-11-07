import { createArcadeServer } from "./index"

const server = createArcadeServer()
const port = Number(process.env.PORT ?? 8787)
const actual = await server.listen(port)

console.log(`[arcade] verifier listening on http://127.0.0.1:${actual}`)
