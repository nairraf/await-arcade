import { rmSync } from "node:fs"

// The inliner rewrites index.html in place. Remove the previous output first so
// a second build cannot read an already-inlined page and nest the app bundle.
rmSync(new URL("./index.html", import.meta.url), { force: true })
