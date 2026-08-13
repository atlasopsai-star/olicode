import type { Agent } from "@/agent/agent"
import { Design } from "./design-contract"

export type Action = "answer" | "inspect" | "change" | "debug" | "design" | "research" | "browser" | "ship"
export type RigorLevel = "FAST" | "STANDARD" | "DEEP" | "DEBUG" | "DESIGN" | "RESEARCH" | "BROWSER" | "SHIP"
export type ResponseDetail = "tight" | "normal" | "detailed"

export type EvidenceRequirement = {
  id: "change" | "validation" | "tests" | "typecheck" | "build" | "scope" | "browser" | "git" | "deploy"
  description: string
}

export type OliTaskContract = {
  id: string
  objective: string
  action: Action
  acceptanceCriteria: string[]
  nonGoals: string[]
  allowedScope: string[]
  protectedScope: string[]
  requiredEvidence: EvidenceRequirement[]
  rigor: RigorLevel
  response: ResponseDetail
  budgets: {
    expectedFiles?: number
    maxNewDependencies?: number
    toolCallSoftLimit?: number
    inputTokenSoftLimit?: number
  }
}

export type Execution = {
  mode: Action
  rigor: RigorLevel
  objective: string
  contract: OliTaskContract
  browser?: { objective: string; checkpoints: string[] }
}

const MUTATION = ["add", "build", "change", "create", "edit", "fix", "implement", "remove", "rename", "update"]
const DEBUG = ["bug", "debug", "error", "failing", "failure", "regression", "traceback"]
const DESIGN = ["design", "frontend", "landing", "polish", "redesign", "ui", "ux", "visual"]
const RESEARCH = ["analyze", "audit", "compare", "evaluate", "inspect", "investigate", "research", "review"]
const BROWSER = ["browser", "click", "dom", "navigate", "playwright", "screenshot"]
const SHIP = ["deploy", "launch", "pr", "production", "publish", "push", "release", "ship", "vercel"]
const HIGH_RISK = [
  "auth",
  "billing",
  "credential",
  "database",
  "migration",
  "payment",
  "permission",
  "security",
  "token",
]
const MULTI_STEP = ["and then", "also", "as well as", "after that", "additionally"]
const PATH = /(?:^|\s)([\w@.-]+(?:\/[\w@.-]+)+)(?=$|[\s,;:)])/g
const FILE =
  /(?:^|\s)([\w@.-]+\.(?:c|cc|cpp|css|go|html|java|js|json|jsx|kt|md|py|rs|sh|swift|toml|ts|tsx|yaml|yml))(?=$|[\s,;:)])/gi
const PROTECTED = [".env", ".git/", "bun.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]
const STOP_WORDS = new Set(["and", "for", "the", "this", "that", "to", "use", "with"])

export function enabled() {
  return process.env.OLICODE_HARNESS !== "0"
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_.@/-]+/)
    .filter((part) => part.length >= 2)
}

function contains(tokens: string[], values: string[]) {
  return values.some((value) => tokens.includes(value))
}

function stableID(text: string) {
  let hash = 2166136261
  for (const value of text) {
    hash ^= value.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `task-${(hash >>> 0).toString(36)}`
}

export function objective(query: string) {
  return query.replace(/\s+/g, " ").trim().slice(0, 240)
}

export function action(query: string): Action {
  const tokens = tokenize(query)
  if (contains(tokens, SHIP)) return "ship"
  if (contains(tokens, BROWSER)) return "browser"
  if (contains(tokens, DESIGN)) return "design"
  if (contains(tokens, DEBUG)) return "debug"
  if (contains(tokens, MUTATION)) return "change"
  if (contains(tokens, RESEARCH))
    return tokens.includes("inspect") || tokens.includes("review") || tokens.includes("audit") ? "inspect" : "research"
  return "answer"
}

export function routeMode(query: string): "build" | "debug" | "design" | "research" | "browser" | "ship" {
  const selected = action(query)
  if (selected === "answer" || selected === "change") return "build"
  if (selected === "inspect") return "research"
  return selected
}

function expectedFiles(query: string, selected: Action) {
  const paths = [...query.matchAll(PATH)].length
  if (paths > 0) return Math.min(paths, 10)
  if (selected === "answer" || selected === "inspect" || selected === "research") return 0
  if (/\b(tiny|typo|label|wording|rename)\b/i.test(query)) return 1
  return selected === "ship" || selected === "design" ? 5 : 3
}

export function rigor(query: string, selected = action(query)): RigorLevel {
  if (selected === "ship") return "SHIP"
  if (selected === "browser") return "BROWSER"
  if (selected === "design") return "DESIGN"
  if (selected === "debug") return "DEBUG"
  if (selected === "research" || selected === "inspect") return "RESEARCH"
  const tokens = tokenize(query)
  if (contains(tokens, HIGH_RISK) || /\b(across|architecture|large|many|system-wide)\b/i.test(query)) return "DEEP"
  if (
    selected === "change" &&
    tokens.length <= 12 &&
    !MULTI_STEP.some((signal) => query.toLowerCase().includes(signal)) &&
    expectedFiles(query, selected) <= 1
  )
    return "FAST"
  return "STANDARD"
}

function evidence(query: string, selected: Action, level: RigorLevel): EvidenceRequirement[] {
  if (selected === "answer" || selected === "inspect" || selected === "research") return []
  const base: EvidenceRequirement[] = [
    { id: "change", description: "The requested change is present." },
    { id: "validation", description: "A targeted validation completed successfully." },
    { id: "scope", description: "Every changed file is relevant to the task contract." },
  ]
  const explicit = [
    [/\btest(?:s|ing)?\b/i, { id: "tests", description: "The user-requested tests passed." }],
    [/\btypecheck|type check\b/i, { id: "typecheck", description: "The user-requested type check passed." }],
    [
      /\b(?:run|verify|ensure|check) (?:the )?build\b|\bbuild (?:passes|must pass)\b/i,
      { id: "build", description: "The user-requested build passed." },
    ],
    [/\bdeploy|vercel\b/i, { id: "deploy", description: "The requested deployment completed and returned a result." }],
  ].flatMap(([pattern, requirement]) => ((pattern as RegExp).test(query) ? [requirement as EvidenceRequirement] : []))
  if (level === "FAST") return [...base, ...explicit.filter((item) => !base.some((base) => base.id === item.id))]
  if (level === "DESIGN")
    return [
      ...base,
      { id: "build", description: "The project builds." },
      { id: "browser", description: "The rendered result was checked with the browser tool." },
    ]
  if (level === "BROWSER") return [{ id: "browser", description: "The requested browser assertions passed." }]
  if (level === "SHIP")
    return [
      ...base,
      { id: "tests", description: "Required tests passed." },
      { id: "git", description: "Git state and requested remote result were verified." },
    ]
  const standard: EvidenceRequirement[] = [
    ...base,
    { id: "tests", description: "Relevant tests or type checks passed." },
    ...explicit,
  ]
  return standard.filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
}

function sentences(query: string) {
  return query
    .split(/(?:\n+|(?<=[.!?])\s+)/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function acceptanceCriteria(query: string, selected: Action) {
  const explicit = sentences(query).filter((item) =>
    /\b(?:must|should|ensure|verify|pass|without|only|do not|don't|never)\b/i.test(item),
  )
  const outcome =
    selected === "answer" || selected === "inspect" || selected === "research"
      ? "The requested analysis or answer addresses the stated outcome."
      : "The requested behavior is implemented and observable."
  return [outcome, ...explicit].slice(0, 8)
}

function nonGoals(query: string) {
  const explicit = sentences(query).filter((item) => /\b(?:do not|don't|never|without adding|no new)\b/i.test(item))
  return [...explicit, "Unrequested refactors, cleanup, dependencies, or features."].slice(0, 8)
}

function scopes(query: string) {
  const explicit = [...query.matchAll(PATH), ...query.matchAll(FILE)].flatMap((match) =>
    match[1] ? [match[1].replace(/[.,]$/, "")] : [],
  )
  return explicit.length ? [...new Set(explicit)] : ["."]
}

export function contract(query: string): OliTaskContract {
  const selected = action(query)
  const level = rigor(query, selected)
  const files = expectedFiles(query, selected)
  return {
    id: stableID(query),
    objective: objective(query),
    action: selected,
    acceptanceCriteria: acceptanceCriteria(query, selected),
    nonGoals: nonGoals(query),
    allowedScope: scopes(query),
    protectedScope: PROTECTED,
    requiredEvidence: evidence(query, selected, level),
    rigor: level,
    response: "tight",
    budgets: {
      expectedFiles: files,
      maxNewDependencies: /\b(add|install) (?:a )?dependenc/i.test(query) ? 1 : 0,
      toolCallSoftLimit: level === "FAST" ? 6 : level === "DEEP" ? 30 : 18,
      inputTokenSoftLimit: level === "FAST" ? 12_000 : level === "DEEP" ? 80_000 : 40_000,
    },
  }
}

export function browserMetadata(query: string) {
  return {
    objective: objective(query),
    checkpoints: tokenize(query)
      .filter((part) => !STOP_WORDS.has(part))
      .slice(0, 6),
  }
}

export function execution(input: { query: string }): Execution {
  const active = contract(input.query)
  return {
    mode: active.action,
    rigor: active.rigor,
    objective: active.objective,
    contract: active,
    ...(active.action === "browser" ? { browser: browserMetadata(input.query) } : {}),
  }
}

export function render(input: { agent: Agent.Info; query: string }) {
  if (!enabled()) return ""
  const active = contract(input.query)
  return [
    "<olicode_harness>",
    `Task: ${active.id}`,
    `Action: ${active.action}`,
    `Rigor: ${active.rigor}`,
    `Objective: ${active.objective}`,
    `Expected files: ${active.budgets.expectedFiles ?? "unknown"}`,
    `New dependency budget: ${active.budgets.maxNewDependencies ?? 0}`,
    "Use the smallest correct implementation. Reuse existing code, platform behavior, standard library, and installed dependencies before adding code or dependencies.",
    "Every substantial action must materially help the task contract. Do not perform drive-by cleanup, unrelated formatting, or speculative work.",
    active.rigor === "FAST"
      ? "Inspect the target, make the surgical edit, verify narrowly, and stop."
      : "Verify the acceptance criteria and changed-file scope before finishing.",
    input.agent.name === "plan" ? "Plan precisely. Do not implement code in this mode." : undefined,
    "Final response style: tight. State outcome, changed files, verification, and unresolved issues only.",
    "</olicode_harness>",
    active.action === "design" ? Design.checklist(Design.contract(input.query)) : undefined,
  ]
    .filter(Boolean)
    .join("\n")
}

// Kept for compatibility with callers and extensions using the original six-mode API.
export const classify = routeMode

export * as SessionHarness from "./harness"
