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
    ])
      expect(ShellPolicy.classify(command)).toBe("READ_ONLY")
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
})
