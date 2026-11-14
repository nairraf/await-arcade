import type {
  AuthPoll,
  AuthState,
  DeviceFlow,
  GameEntry,
  GameHost,
} from "@await-arcade/contract"
import { el } from "@await-arcade/framework"
import { errorMessage, profileNode, safeVerificationUri } from "./ui"

export interface AuthModalOptions {
  readonly root: HTMLElement
  readonly host: GameHost
  readonly games: readonly GameEntry[]
  readonly getAuthState: () => AuthState | undefined
  readonly applyAuth: (state: AuthState) => void
  readonly onClosed: () => void
}

export function openAuthModal(options: AuthModalOptions): (() => void) | undefined {
  const { root, host, games, getAuthState, applyAuth, onClosed } = options
  if (!host.authState) return undefined
  if (root.querySelector(".arcade-auth-backdrop")) return undefined

  const backdrop = el("div", "arcade-auth-backdrop")
  const card = el("div", "arcade-overlay-card arcade-auth-card")
  backdrop.append(card)
  root.append(backdrop)

  let timer: ReturnType<typeof setInterval> | undefined
  const close = (): void => {
    if (timer) clearInterval(timer)
    timer = undefined
    onClosed()
    backdrop.remove()
  }

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close()
  })

  const authAction = (label: string, primary: boolean, run: () => void): HTMLButtonElement => {
    const node = el("button", `arcade-btn${primary ? " arcade-btn-primary" : ""}`, label)
    node.type = "button"
    node.addEventListener("click", run)
    return node
  }

  const actionRow = (...buttons: HTMLButtonElement[]): HTMLElement => {
    const row = el("div", "arcade-overlay-actions")
    row.append(...buttons)
    return row
  }

  const renderSignedOut = (message?: string): void => {
    card.replaceChildren(
      el("div", "arcade-overlay-kicker", "ACCOUNT"),
      el("h2", "arcade-overlay-title", "Sign in to rank"),
      el(
        "div",
        "arcade-overlay-detail",
        message ??
          "Play as a guest, or sign in with GitHub to submit verified runs to the shared boards.",
      ),
      actionRow(
        authAction("Sign in with GitHub", true, () => {
          void startFlow()
        }),
        authAction("Close", false, close),
      ),
    )
  }

  const renderFlow = (flow: DeviceFlow): void => {
    const status = el("div", "arcade-overlay-detail", "Waiting for GitHub…")
    const verification = safeVerificationUri(flow.verificationUri)
    const link = el("a", "arcade-auth-link", verification)
    link.href = verification
    link.target = "_blank"
    link.rel = "noreferrer"

    const copy = authAction("Copy code", false, () => {
      void globalThis.navigator?.clipboard
        ?.writeText(flow.userCode)
        .then(() => host.toast("Code copied"))
        .catch(() => host.toast("Select the code above to copy it"))
    })

    const step = (
      number: string,
      title: string,
      detail: string,
      action: HTMLElement,
    ): HTMLElement => {
      const item = el("li", "arcade-auth-step")
      const body = el("div", "arcade-auth-step-body")
      body.append(
        el("div", "arcade-auth-step-title", title),
        el("div", "arcade-auth-step-detail", detail),
        action,
      )
      item.append(el("span", "arcade-auth-step-num", number), body)
      return item
    }

    const steps = el("ol", "arcade-auth-steps")
    steps.append(
      step("1", "Copy your code", "Use the button or select the code above.", copy),
      step("2", "Open GitHub and enter it", "Authorize Await Arcade once.", link),
    )

    card.replaceChildren(
      el("div", "arcade-overlay-kicker", "GITHUB DEVICE FLOW"),
      el("h2", "arcade-overlay-title", "Enter this code"),
      el("div", "arcade-auth-code", flow.userCode),
      steps,
      status,
      actionRow(authAction("Cancel", false, close)),
    )

    let interval = Math.max(1, flow.interval)
    let polling = false
    const schedule = (): void => {
      if (timer) clearInterval(timer)
      timer = setInterval(() => {
        void tick()
      }, interval * 1000)
    }
    const tick = async (): Promise<void> => {
      if (polling) return
      polling = true
      try {
        const result: AuthPoll = await host.authPoll!(flow.flowId)
        if (result.status === "complete") {
          applyAuth(result)
          close()
          host.toast("Signed in")
          return
        }
        if (result.interval && result.interval !== interval) {
          interval = Math.max(1, result.interval)
          schedule()
        }
      } catch (error) {
        if (timer) clearInterval(timer)
        timer = undefined
        status.textContent = errorMessage(error)
      } finally {
        polling = false
      }
    }

    schedule()
    void tick()
  }

  const startFlow = async (): Promise<void> => {
    try {
      const flow = await host.authStart!()
      renderFlow(flow)
    } catch (error) {
      renderSignedOut(errorMessage(error))
    }
  }

  const renderSignedIn = (state: AuthState): void => {
    const children: HTMLElement[] = [
      el("div", "arcade-overlay-kicker", "ACCOUNT"),
      el("h2", "arcade-overlay-title", state.displayName ?? "Signed in"),
      el(
        "div",
        "arcade-overlay-detail",
        `GitHub @${state.githubLogin ?? "player"}${state.queued ? ` · ${state.queued} queued` : ""}`,
      ),
    ]

    const profileSlot = el("div", "arcade-profile-slot")
    profileSlot.append(
      el("div", "arcade-overlay-kicker", "ARCADE XP"),
      el("div", "arcade-overlay-detail", "Loading arcade rank…"),
    )
    children.push(profileSlot)

    if (host.updateName) {
      const nameInput = el("input", "arcade-input")
      nameInput.type = "text"
      nameInput.maxLength = 24
      nameInput.autocomplete = "off"
      nameInput.placeholder = "Arcade name"
      nameInput.setAttribute("aria-label", "Arcade name")
      nameInput.value = state.displayName ?? ""
      nameInput.spellcheck = false

      const saveName = authAction("Save name", false, () => {
        const name = nameInput.value.trim()
        if (!name) {
          host.toast("Enter an arcade name.")
          return
        }
        if (name === state.displayName) {
          host.toast("That is already your arcade name.")
          return
        }
        saveName.disabled = true
        void host
          .updateName!(name)
          .then((next) => {
            applyAuth(next)
            host.toast("Arcade name updated")
            renderSignedIn(next)
          })
          .catch((error: unknown) => {
            saveName.disabled = false
            host.toast(errorMessage(error))
          })
      })

      const nameStatus = el("div", "arcade-name-status", "")
      let nameTimer: ReturnType<typeof setTimeout> | undefined
      const checkName = (): void => {
        if (!host.nameAvailable) return
        const name = nameInput.value.trim()
        if (nameTimer) clearTimeout(nameTimer)
        if (!name) {
          saveName.disabled = true
          nameStatus.textContent = "Enter an arcade name."
          delete nameStatus.dataset.state
          return
        }
        nameTimer = setTimeout(() => {
          void host
            .nameAvailable!(name)
            .then((result) => {
              if (!nameInput.isConnected) return
              saveName.disabled = !result.available
              nameStatus.textContent = result.available ? "Available" : "Taken"
              nameStatus.dataset.state = result.available ? "ok" : "bad"
            })
            .catch((error: unknown) => {
              if (!nameInput.isConnected) return
              saveName.disabled = false
              nameStatus.textContent = errorMessage(error)
              delete nameStatus.dataset.state
            })
        }, 300)
      }
      nameInput.addEventListener("input", checkName)

      const nameRow = el("div", "arcade-name-row")
      nameRow.append(nameInput, saveName)
      children.push(
        el("div", "arcade-overlay-kicker", "ARCADE NAME"),
        nameRow,
        el(
          "div",
          "arcade-overlay-detail",
          "Shown on leaderboards instead of your GitHub name. Two changes per UTC day.",
        ),
        nameStatus,
      )
      checkName()
    }

    children.push(
      actionRow(
        authAction("Sign out", false, () => {
          void host
            .signOut!()
            .then((next) => {
              applyAuth(next)
              renderSignedOut("Signed out. Guest scores stay local.")
            })
            .catch((error: unknown) => {
              const message = errorMessage(error)
              const current = getAuthState()
              if (current?.signedIn) {
                renderSignedIn(current)
                host.toast(message)
              } else {
                renderSignedOut(message)
              }
            })
        }),
        authAction("Delete account", false, () => {
          const ok =
            typeof globalThis.confirm === "function"
              ? globalThis.confirm("Delete your player, sessions, and leaderboard entries?")
              : false
          if (!ok) return
          void host
            .deleteAccount!()
            .then((next) => {
              applyAuth(next)
              renderSignedOut("Account deleted.")
            })
            .catch((error: unknown) => {
              const message = errorMessage(error)
              const current = getAuthState()
              if (current?.signedIn) {
                renderSignedIn(current)
                host.toast(message)
              } else {
                renderSignedOut(message)
              }
            })
        }),
        authAction("Close", true, close),
      ),
    )

    card.replaceChildren(...children)

    if (host.profile) {
      void host
        .profile()
        .then((profile) => {
          if (!profileSlot.isConnected) return
          profileSlot.replaceChildren(
            profileNode(
              profile,
              (gameId) =>
                games.find((candidate) => candidate.meta.id === gameId)?.meta.title ?? gameId,
            ),
          )
        })
        .catch((error: unknown) => {
          if (!profileSlot.isConnected) return
          profileSlot.replaceChildren(
            el("div", "arcade-overlay-detail", errorMessage(error)),
          )
        })
    }
  }

  const current = getAuthState()
  if (current?.signedIn) {
    renderSignedIn(current)
    return close
  }

  renderSignedOut()
  void host
    .authState()
    .then((state) => {
      applyAuth(state)
      if (state.signedIn) renderSignedIn(state)
    })
    .catch(() => undefined)

  return close
}
