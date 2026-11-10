import { createArcadeServer } from "./index"
import { FirestoreStore } from "./firestore"

const projectId = process.env.AWAIT_ARCADE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT
const databaseId = process.env.AWAIT_ARCADE_DATABASE_ID

const store = new FirestoreStore({
  ...(projectId ? { projectId } : {}),
  ...(databaseId ? { databaseId } : {}),
})

const server = createArcadeServer({ store, host: "0.0.0.0" })
const port = Number(process.env.PORT ?? 8080)
const actual = await server.listen(port)

console.log(`[await-arcade] api listening on ${actual}`)
