export function ensureStyle(id: string, css: string): void {
  if (typeof document === "undefined") return
  if (document.getElementById(id)) return

  const style = document.createElement("style")
  style.id = id
  style.textContent = css
  document.head.appendChild(style)
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function clear(node: Element): void {
  node.replaceChildren()
}
