export type ShellMutation = "READ_ONLY" | "EXPECTED_MUTATION" | "UNKNOWN_MUTATION" | "DESTRUCTIVE"

const READ_ONLY = new Set([
  "bun",
  "cat",
  "git",
  "grep",
  "ls",
  "npm",
  "pnpm",
  "rg",
  "yarn",
  "cargo",
  "go",
  "pytest",
  "python",
  "python3",
  "tsc",
  "tsgo",
])

const MUTATION =
  /(?:^|[;&|]\s*)(?:cp|mkdir|mv|tee|touch)\b|\b(?:sed|perl)\s+-[^\s]*i\b|(?:^|\s)(?:>|>>)\s*[^&]|\b(?:prettier\s+--write|eslint\b[^;&|]*\s--fix|gofmt\s+-w|cargo\s+fmt|generate|codegen)\b/i
const DESTRUCTIVE = /(?:^|[;&|]\s*)rm\b|\bgit\s+(?:checkout|restore|reset)\b/i
const INSTALL = /\b(?:bun|npm|pnpm|yarn)\s+(?:add|install|i)\b|\b(?:pip|uv)\s+install\b|\bcargo\s+add\b/i
const READ_GIT = /\bgit\s+(?:status|diff|show|log|branch|rev-parse|ls-files)\b/i

export function classify(command: string): ShellMutation {
  if (DESTRUCTIVE.test(command)) return "DESTRUCTIVE"
  if (INSTALL.test(command) || MUTATION.test(command)) return "EXPECTED_MUTATION"
  if (/\$\(|`|\beval\b|\bsh\s+-c\b|\bbash\s+-c\b/i.test(command)) return "UNKNOWN_MUTATION"
  const segments = command
    .split(/&&|\|\||[;|]/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (
    segments.every((segment) => {
      const executable = segment.match(/^(?:[A-Z_][A-Z0-9_]*=[^\s]+\s+)*([\w.-]+)/i)?.[1]?.toLowerCase()
      if (!executable || !READ_ONLY.has(executable)) return false
      if (executable === "git") return READ_GIT.test(segment)
      if (["bun", "npm", "pnpm", "yarn"].includes(executable))
        return /\b(?:test|typecheck|lint|build|run)\b/i.test(segment)
      if (executable === "cargo") return /\b(?:test|check|build|clippy)\b/i.test(segment)
      if (executable === "go") return /\b(?:test|build|vet)\b/i.test(segment)
      return true
    })
  )
    return "READ_ONLY"
  return "UNKNOWN_MUTATION"
}

export function paths(command: string) {
  return [...command.matchAll(/(?:^|\s)(?:>|>>)?\s*(["']?[^\s;&|<>]+["']?)/g)]
    .flatMap((match) => (match[1] ? [match[1].replace(/^["']|["']$/g, "")] : []))
    .filter(
      (item) =>
        !item.startsWith("-") &&
        !/^[A-Z_][A-Z0-9_]*=/i.test(item) &&
        (item.includes("/") || item.startsWith(".") || /\.[a-z0-9]{1,8}$/i.test(item)),
    )
}

export function installsDependency(command: string) {
  return INSTALL.test(command)
}

export * as ShellPolicy from "./shell-policy"
