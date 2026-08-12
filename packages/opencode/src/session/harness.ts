import type { Agent } from "@/agent/agent"

export type Mode = "build" | "debug" | "design" | "research" | "browser" | "ship"

const ORDER: Mode[] = ["browser", "debug", "design", "ship", "research", "build"]

const KEYWORDS: Record<Mode, string[]> = {
  browser: ["browser", "playwright", "web", "website", "checkout", "login", "click", "navigate", "dom"],
  debug: ["bug", "debug", "fix", "failing", "failure", "error", "broken", "regression", "traceback"],
  design: ["design", "redesign", "ui", "ux", "landing", "visual", "visually", "polish", "brand", "premium"],
  ship: ["deploy", "release", "launch", "ship", "production", "prod", "publish"],
  research: ["research", "compare", "evaluate", "investigate", "benchmark", "analyze", "analysis"],
  build: ["build", "code", "implement", "feature", "refactor", "app", "backend", "frontend", "integrate"],
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "that",
  "this",
  "from",
  "into",
  "your",
  "make",
  "keep",
  "just",
  "have",
  "will",
])

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3)
}

export function classify(text: string): Mode {
  const tokens = tokenize(text)
  if (tokens.length === 0) return "build"

  const scores = Object.fromEntries(
    ORDER.map((mode) => [
      mode,
      KEYWORDS[mode].reduce((total, keyword) => total + (tokens.includes(keyword) ? 1 : 0), 0),
    ]),
  ) as Record<Mode, number>

  return ORDER.reduce((best, mode) => {
    if (scores[mode] > scores[best]) return mode
    return best
  }, "build" as Mode)
}

export function objective(query: string) {
  return query
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160)
}

export function browserMetadata(query: string) {
  const values = tokenize(query).filter((part) => !STOP_WORDS.has(part)).slice(0, 6)
  return {
    objective: objective(query),
    checkpoints: values,
  }
}

export function execution(input: { query: string }) {
  const mode = classify(input.query)
  return {
    mode,
    objective: objective(input.query),
    ...(mode === "browser" ? { browser: browserMetadata(input.query) } : {}),
  }
}

export function render(input: { agent: Agent.Info; query: string }) {
  const details = execution({ query: input.query })
  const lines = [
    "<olicode_harness>",
    `Mode: ${details.mode}`,
    "Stay tightly focused on the user's main objective.",
    "Keep progress updates and final answers short, direct, and high-signal.",
    "Do not repeat the user's request, narrate obvious steps, or drift into unrelated research.",
    "Prefer the smallest correct change over broad rewrites or speculative abstractions.",
    "Load only the skills and tools that directly help with the current task.",
    "Stop once the requested outcome is achieved and verified.",
  ]

  if (input.agent.name === "plan") lines.push("Plan precisely. Do not implement code in this mode.")
  if (details.mode === "build") lines.push("Read the relevant code, make a tight plan, implement the minimum high-quality diff, and verify it.")
  if (details.mode === "debug") lines.push("Find the root cause before changing code. Fix the source of the problem, not just the symptom.")
  if (details.mode === "design")
    lines.push("Aim for premium, non-generic design quality: strong hierarchy, spacing, typography, motion restraint, and polished interactions.")
  if (details.mode === "research")
    lines.push("Research only what directly informs the next decision. Synthesize findings briefly, then move back to execution.")
  if (details.mode === "browser")
    lines.push("Use browser workflows when they materially advance the task. Keep browser exploration purposeful and concise.")
  if (details.mode === "ship") lines.push("Prioritize production readiness: verify tests, build health, deployment steps, and user-facing quality before finishing.")

  lines.push("</olicode_harness>")
  return lines.join("\n")
}

export * as SessionHarness from "./harness"
