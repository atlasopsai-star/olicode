import type { Page } from "playwright"

export type Element = {
  index: number
  tag: string
  type?: string
  label: string
}

// Runs inside the page. Tags every visible interactive element with a stable
// index so the model can act by index instead of guessing CSS selectors --
// the same core insight browser-use's DOM processing pipeline is built on.
function tag(): Element[] {
  const selector =
    'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick], [contenteditable="true"]'
  const nodes = Array.from(document.querySelectorAll(selector))
  const visible = nodes.filter((el) => {
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    const style = getComputedStyle(el)
    return style.visibility !== "hidden" && style.display !== "none"
  })
  document.querySelectorAll("[data-oli-index]").forEach((el) => el.removeAttribute("data-oli-index"))
  return visible.slice(0, 150).map((el, index) => {
    el.setAttribute("data-oli-index", String(index))
    const label =
      el.getAttribute("aria-label")?.trim() ||
      (el instanceof HTMLInputElement ? el.placeholder || el.value : "") ||
      (el.textContent ?? "").trim()
    return {
      index,
      tag: el.tagName.toLowerCase(),
      type: el instanceof HTMLInputElement ? el.type : undefined,
      label: label.replace(/\s+/g, " ").slice(0, 80),
    }
  })
}

export async function elements(page: Page): Promise<Element[]> {
  return page.evaluate(tag)
}

export function format(items: Element[]): string {
  if (items.length === 0) return "(no interactive elements found)"
  return items
    .map((item) => `[${item.index}] <${item.tag}${item.type ? ` type=${item.type}` : ""}> ${item.label}`.trim())
    .join("\n")
}

export async function locate(page: Page, index: number) {
  return page.locator(`[data-oli-index="${index}"]`)
}
