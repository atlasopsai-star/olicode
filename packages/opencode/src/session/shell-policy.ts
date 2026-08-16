export type ShellMutation = "READ_ONLY" | "EXPECTED_MUTATION" | "UNKNOWN_MUTATION" | "DESTRUCTIVE"

const READ_ONLY = new Set([
  "bun",
  "cat",
  "date",
  "diff",
  "echo",
  "env",
  "git",
  "grep",
  "head",
  "ls",
  "npm",
  "pnpm",
  "printenv",
  "pwd",
  "rg",
  "tail",
  "test",
  "wc",
  "which",
  "whoami",
  "yarn",
  "cargo",
  "go",
  "pytest",
  "python",
  "python3",
  "tsc",
  "tsgo",
  // Launches a URL/file in its default OS handler (browser, Preview, etc.) --
  // no filesystem or repo state changes, same safety tier as `git status` or
  // `ls`. Live-caught: "open github" was classified UNKNOWN_MUTATION and
  // silently blocked on a permission prompt easy to miss in the TUI, making
  // a request that should be instant look like a hang.
  "open",
  "xdg-open",
  // A version check never mutates anything; gated to --version/-v/-V below
  // like bun/npm/etc, not blanket-allowed (arbitrary `node script.js` isn't
  // safe to auto-run). Live-caught: "node --version" and "bun --version"
  // were denied in a non-interactive run alongside the same "open" bug.
  "node",
  // Passive process/socket inspection, no mutating form exists for either --
  // same tier as `whoami`/`which`. Live-caught: verifying a just-started dev
  // server ("lsof -iTCP:3000 -sTCP:LISTEN") required a permission click for
  // what is, functionally, a read-only status check.
  "lsof",
  "ps",
])

const MUTATION =
  /(?:^|[;&|]\s*)(?:cp|mkdir|mv|tee|touch)\b|\b(?:sed|perl)\s+-[^\s]*i\b|(?:^|\s)(?:>|>>)\s*[^&]|\b(?:prettier\s+--write|eslint\b[^;&|]*\s--fix|gofmt\s+-w|cargo\s+fmt|generate|codegen)\b/i
const DESTRUCTIVE = /(?:^|[;&|]\s*)rm\b|\bgit\s+(?:checkout|restore|reset)\b/i
const INSTALL = /\b(?:bun|npm|pnpm|yarn)\s+(?:add|install|i)\b|\b(?:pip|uv)\s+install\b|\bcargo\s+add\b/i
const READ_GIT = /\bgit\s+(?:status|diff|show|log|branch|rev-parse|ls-files)\b/i
// Live-caught alongside "open": "bun --version"/"node --version" were also
// denied. A version check never mutates anything regardless of tool.
const VERSION_CHECK = /(?:^|\s)(?:--version|-v|-V)(?:\s|$)/

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
      if (executable === "node") return VERSION_CHECK.test(segment)
      if (executable === "git") return READ_GIT.test(segment) || VERSION_CHECK.test(segment)
      if (["bun", "npm", "pnpm", "yarn"].includes(executable))
        return /\b(?:test|typecheck|lint|build|run)\b/i.test(segment) || VERSION_CHECK.test(segment)
      if (executable === "cargo") return /\b(?:test|check|build|clippy)\b/i.test(segment) || VERSION_CHECK.test(segment)
      if (executable === "go") return /\b(?:test|build|vet|version)\b/i.test(segment)
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
        // A URL argument (curl/wget health checks, fetch calls) contains "/"
        // the same as a file path does, but isn't one. Live-caught:
        // `curl -fsS http://127.0.0.1:3001` had the URL misread as a new
        // file needing scope justification, blocking a routine server
        // health check with the exact same false-block as a real mutation.
        !/^[a-z][a-z0-9+.-]*:\/\//i.test(item) &&
        (item.includes("/") || item.startsWith(".") || /\.[a-z0-9]{1,8}$/i.test(item)),
    )
}

export function installsDependency(command: string) {
  return INSTALL.test(command)
}

export * as ShellPolicy from "./shell-policy"
