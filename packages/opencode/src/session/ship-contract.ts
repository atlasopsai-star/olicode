export type ShipScope = "preflight" | "commit" | "push" | "pr" | "deploy"

export type Contract = {
  scope: ShipScope
  steps: string[]
}

const DEPLOY = /\bdeploy|preview|vercel\b/i
const PR = /\bpr\b|\bpull request\b/i
const PUSH = /\bpush\b/i

// Escalating: deploy > pr > push > commit. Each scope includes everything
// beneath it (a deploy implies push implies commit) but never more than what
// was actually asked -- "push this" must not also open a PR or deploy.
export function classify(query: string): ShipScope {
  const requested = query
    .split(/(?:\n+|(?<=[.!?])\s+)/)
    .filter((item) => !/\b(?:do not|don't|never|without)\b/i.test(item))
    .join(" ")
  if (DEPLOY.test(requested)) return "deploy"
  if (PR.test(requested)) return "pr"
  if (PUSH.test(requested)) return "push"
  if (/\bpreflight|readiness|ready to ship\b/i.test(requested)) return "preflight"
  return "commit"
}

function steps(scope: ShipScope): string[] {
  const base = [
    "Call ship(preflight) to see git/GitHub/Vercel state before doing anything.",
    "Confirm every changed file traces to this task (ScopeGuard) before staging anything.",
    "Run the project's required tests/build/typecheck for this change.",
  ]
  if (scope === "preflight") return base
  if (scope === "commit")
    return [...base, "Call ship(commit) with an explicit file list and a conventional commit message."]
  if (scope === "push") return [...base, "Call ship(push)."]
  if (scope === "pr") return [...base, "Call ship(push).", "Call ship(pr) with a title and body."]
  return [
    ...base,
    "Call ship(deploy) to trigger a Vercel preview.",
    "Open the returned preview URL with the browser tool and confirm it loads without console errors.",
  ]
}

export function contract(query: string): Contract {
  const scope = classify(query)
  return { scope, steps: steps(scope) }
}

export function checklist(active: Contract) {
  return [
    "<olicode_ship_contract>",
    `Scope: ${active.scope}`,
    "Do exactly this, in order, and nothing beyond it unless the user explicitly asked for more:",
    ...active.steps.map((item, index) => `${index + 1}. ${item}`),
    "Every commit, push, PR, or deploy goes through the ship tool's own permission prompt, same as any other consequential action. Never skip or preempt that confirmation, and never approximate these with raw shell git/gh/vercel commands.",
    "</olicode_ship_contract>",
  ].join("\n")
}

export * as Ship from "./ship-contract"
