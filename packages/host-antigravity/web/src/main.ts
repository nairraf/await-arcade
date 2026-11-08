import { createArcade } from "@await-arcade/shell"
import { games } from "@await-arcade/shell/registry"
import { SidecarHost } from "./host"

const root = document.querySelector<HTMLElement>("#arcade")

if (!root) throw new Error("Await Arcade: missing #arcade root")

createArcade({
  root,
  games,
  host: new SidecarHost(),
})
