import {
  Command,
  Panel,
  Plugin,
  Style,
  TitlebarItem,
  usePlugin,
  type PanelTab,
} from "@opencode/plugin/gui"
import { createEffect, onCleanup, onMount } from "solid-js"
import { createArcade, styles } from "@await-arcade/shell"
import { games } from "@await-arcade/shell/registry"
import { OpenCodeHost } from "./host"
import { commandId, displayName, pluginId } from "./profile.js"

const ID = "main"

const tab: PanelTab = {
  id: ID,
  get title() {
    return displayName
  },
  pinned: true,
  closable: false,
  draggable: false,
  tabbable: true,
}

function ArcadePanel() {
  const ctx = usePlugin()
  const host = new OpenCodeHost(ctx.client)
  let mount!: HTMLDivElement
  let lastKey: string | undefined
  let wasRunning = false

  createEffect(() => {
    const session = ctx.sessions.current()
    if (!session || !session.server.connected) {
      lastKey = undefined
      wasRunning = false
      return
    }
    const status = session.server.data.session.status(session.id)
    if (session.key !== lastKey) {
      lastKey = session.key
      wasRunning = status === "running"
      return
    }
    if (wasRunning && status === "idle") {
      host.notifyAttention({ reason: "reply" })
    }
    wasRunning = status === "running"
  })

  createEffect(() => {
    const session = ctx.sessions.current()
    if (!session) return
    const unsub = session.server.data.on("permission.asked", (event) => {
      const targetSession = event.data?.sessionID
      if (!targetSession) return
      if (
        targetSession === session.id ||
        session.server.data.session.root(targetSession) === session.id
      ) {
        host.notifyAttention({ reason: "prompt" })
      }
    })
    onCleanup(unsub)
  })

  onMount(() => {
    const arcade = createArcade({
      root: mount,
      games,
      host,
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
      mobile: { title: displayName, order: 46, kind: "menu", icon: "status", cached: true },
      list: () => [tab],
      render: () => <ArcadePanel />,
    })

    ctx.add(
      Command,
      (): Command => ({
        id: commandId,
        title: displayName,
        description: `Open ${displayName}`,
        keywords: "arcade game brickstorm light cycles mergegrid mineflag",
        group: displayName,
        section: "navigation",
        enabled: !!current(),
        run: toggle,
      }),
    )

    ctx.add(TitlebarItem, (): TitlebarItem | undefined => {
      if (!current()) return undefined

      return {
        // Keyed by the plugin identity, not the shared panel id: the host keeps
        // a pill's element while its id stays, so a release and a dev build
        // installed side by side would otherwise share one pill and keep the
        // first label.
        id: pluginId,
        label: displayName,
        icon: "status",
        pressed: shown(),
        run: toggle,
      }
    })
  },
})
