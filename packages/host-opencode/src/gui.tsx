import {
  Command,
  Panel,
  Plugin,
  Style,
  TitlebarItem,
  type PanelTab,
} from "@opencode/plugin/gui"
import { onCleanup, onMount } from "solid-js"
import { createArcade, LocalHost, styles } from "@await-arcade/shell"
import { games } from "@await-arcade/shell/registry"

const ID = "main"

const tab: PanelTab = {
  id: ID,
  get title() {
    return "Await Arcade"
  },
  pinned: true,
  closable: false,
  draggable: false,
  tabbable: true,
}

function ArcadePanel() {
  let mount!: HTMLDivElement

  onMount(() => {
    const arcade = createArcade({
      root: mount,
      games,
      host: new LocalHost({ prefix: "opencode", name: "opencode" }),
      injectStyles: false,
    })

    onCleanup(() => arcade.destroy())
  })

  return <div ref={mount} class="arcade-host" />
}

export default Plugin.define({
  setup(ctx) {
    const key = () => `${ctx.id}:${ID}`
    const current = () => ctx.sessions.current()
    const shown = () => {
      const session = current()
      return session ? ctx.layout.state(key(), session) !== "closed" : false
    }
    const toggle = () => {
      const session = current()
      if (session) ctx.layout.toggle(key(), session)
    }

    ctx.add(Style, `${styles}
.arcade-host {
  height: 100%;
  min-height: 0;
}
`)

    ctx.add(Panel, {
      id: ID,
      region: "side",
      wide: true,
      mobile: { title: "Await Arcade", order: 46, kind: "menu", icon: "status", cached: true },
      list: () => [tab],
      render: () => <ArcadePanel />,
    })

    ctx.add(
      Command,
      (): Command => ({
        id: "open",
        title: "Await Arcade",
        description: "Open Await Arcade",
        keywords: "arcade game minesweeper neon cycles",
        group: "Await Arcade",
        section: "navigation",
        enabled: !!current(),
        run: toggle,
      }),
    )

    ctx.add(TitlebarItem, (): TitlebarItem | undefined => {
      if (!current()) return undefined

      return {
        id: ID,
        label: "Await Arcade",
        icon: "status",
        pressed: shown(),
        run: toggle,
      }
    })
  },
})
