import { describe, expect, test } from "bun:test"
import { ShellPolicy } from "../../src/session/shell-policy"

describe("shell policy", () => {
  test("keeps normal inspection and verification read-only", () => {
    for (const command of [
      "git status --short",
      "git diff --check",
      "rg -n button src",
      "cat src/ui.ts",
      "bun test fixture.test.ts",
      "bun run typecheck",
      "bun run build",
      // Found via OliBench: these got misclassified as UNKNOWN_MUTATION and
      // auto-rejected in non-interactive mode, breaking an otherwise-working
      // task that just wanted its own working directory.
      "pwd",
      "echo hello",
      "which node",
      "whoami",
      "wc -l src/ui.ts",
      "test -f index.html",
      // Live-caught: "open github" silently blocked on a permission prompt
      // easy to miss in the TUI, making an instant request look like a
      // hang. Launching a URL/file in its default OS handler is the same
      // safety tier as `git status` -- no filesystem or repo state change.
      "open https://github.com",
      "open .",
      "xdg-open https://github.com",
      // Live-caught alongside "open": denied in the same non-interactive
      // run. A version check never mutates anything regardless of tool.
      "bun --version",
      "node --version",
      "npm --version",
      "git --version",
      "go version",
      "cargo --version",
    ])
      expect(ShellPolicy.classify(command)).toBe("READ_ONLY")
  })

  test("does not blanket-allow node/bun/npm beyond version checks and known-safe subcommands", () => {
    expect(ShellPolicy.classify("node script.js")).not.toBe("READ_ONLY")
    expect(ShellPolicy.classify("node -e \"require('fs').rmSync('x')\"")).not.toBe("READ_ONLY")
  })

  test("detects expected mutations", () => {
    for (const command of [
      "touch src/new.ts",
      "mkdir src/generated",
      "cp src/a.ts src/b.ts",
      "sed -i '' s/a/b/ src/a.ts",
      "prettier --write src/a.ts",
      "printf value | tee src/a.ts",
      "printf value > src/a.ts",
      "bun add zod",
    ])
      expect(ShellPolicy.classify(command)).toBe("EXPECTED_MUTATION")
  })

  test("detects destructive and unknown commands", () => {
    expect(ShellPolicy.classify("rm src/a.ts")).toBe("DESTRUCTIVE")
    expect(ShellPolicy.classify("git restore src/a.ts")).toBe("DESTRUCTIVE")
    expect(ShellPolicy.classify("bash -c 'do something'")).toBe("UNKNOWN_MUTATION")
  })

  test("extracts file-like mutation targets", () => {
    expect(ShellPolicy.paths("cp src/a.ts src/b.ts")).toEqual(["src/a.ts", "src/b.ts"])
  })

  // Live-caught: a URL argument contains "/" the same as a file path does,
  // so `curl -fsS http://127.0.0.1:3001` (a routine server health check
  // right after starting a dev server) had the URL misread as a new file
  // needing scope justification, blocking it the same as a real mutation.
  test("does not mistake a URL argument for a file path", () => {
    expect(ShellPolicy.paths("curl -fsS http://127.0.0.1:3001")).toEqual([])
    expect(ShellPolicy.paths("curl -fsS https://example.com/health")).toEqual([])
    expect(ShellPolicy.paths("curl -o out.json http://127.0.0.1:3001/api")).toEqual(["out.json"])
  })
})
