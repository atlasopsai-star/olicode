import { describe, expect, test } from "bun:test"
import { Permission } from "../../src/permission"
import { SessionHarness } from "../../src/session/harness"

const build = {
  name: "build",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
} as const

describe("session.harness", () => {
  test("classify picks browser tasks first", () => {
    expect(SessionHarness.action("Use the browser to test checkout and login flow")).toBe("browser")
  })

  test("classify picks design tasks", () => {
    expect(SessionHarness.action("Redesign the landing page UI with more visual polish and premium typography")).toBe(
      "design",
    )
  })

  test("design remains the primary workflow when browser QA is requested", () => {
    expect(SessionHarness.action("Redesign the landing page UI and verify it with browser screenshots")).toBe("design")
  })

  test("render injects concise focus rules", () => {
    const output = SessionHarness.render({
      agent: build,
      query: "Fix the failing auth tests and keep the answer short",
    })

    expect(output).toContain("Action: debug")
    expect(output).toContain("Final response style: tight")
    expect(output).toContain("Every substantial action must materially help")
  })

  test("execution returns browser workflow metadata", () => {
    expect(
      SessionHarness.execution({ query: "Use the browser to test checkout login flow and capture DOM state" }),
    ).toEqual({
      mode: "browser",
      rigor: "BROWSER",
      objective: "Use the browser to test checkout login flow and capture DOM state",
      contract: SessionHarness.contract("Use the browser to test checkout login flow and capture DOM state"),
      browser: {
        objective: "Use the browser to test checkout login flow and capture DOM state",
        checkpoints: ["browser", "test", "checkout", "login", "flow", "capture"],
      },
    })
  })

  test("rigor picks fast for small, well-scoped edits", () => {
    expect(SessionHarness.rigor("Change src/header.ts button label")).toBe("FAST")
    expect(SessionHarness.rigor("Rename src/user.ts variable")).toBe("FAST")
    expect(
      SessionHarness.rigor(
        "Change the button label in src/ui.ts from Save to Continue. Make only the requested change and verify it.",
      ),
    ).toBe("FAST")
  })

  test("rigor picks standard for longer or multi-step requests", () => {
    expect(SessionHarness.rigor("Redesign the landing page UI with more visual polish and premium typography")).toBe(
      "DESIGN",
    )
    expect(SessionHarness.rigor("Fix the login bug and then also update the tests")).toBe("DEBUG")
  })

  test("render includes rigor and skips ceremony for fast tasks", () => {
    const output = SessionHarness.render({
      agent: build,
      query: "Fix the typo in the header",
    })

    expect(output).toContain("Rigor: FAST")
    expect(output).toContain("make the surgical edit")
  })

  test("contract protects lockfiles and budgets dependencies", () => {
    const contract = SessionHarness.contract("Change src/button.ts label")
    expect(contract.action).toBe("change")
    expect(contract.protectedScope).toContain("bun.lock")
    expect(contract.budgets.maxNewDependencies).toBe(0)
    expect(contract.requiredEvidence.map((item) => item.id)).toEqual(["change", "validation", "scope"])
  })

  test("budgets a requested focused test separately from the implementation file", () => {
    expect(SessionHarness.contract("Fix src/account.ts and add a regression test").budgets.expectedFiles).toBe(2)
  })

  test("read-only requests do not authorize mutation", () => {
    expect(SessionHarness.contract("Audit the provider architecture").action).toBe("inspect")
  })

  test("design contracts require rendered responsive evidence", () => {
    expect(SessionHarness.contract("Redesign src/page.tsx UI").requiredEvidence.map((item) => item.id)).toEqual([
      "change",
      "validation",
      "scope",
      "build",
      "browser",
      "wide-screenshot",
      "narrow-screenshot",
      "console",
    ])
  })

  test("deployment contracts require URL and deployed browser evidence", () => {
    expect(SessionHarness.contract("Deploy this to Vercel and verify it").requiredEvidence.map((item) => item.id)).toEqual([
      "scope",
      "tests",
      "deploy",
      "browser",
      "console",
    ])
  })

  test("shipping proof matches the exact external action", () => {
    expect(SessionHarness.contract("Commit the changes, push them, and open a PR").requiredEvidence.map((item) => item.id)).toEqual([
      "scope",
      "tests",
      "commit",
      "push",
      "pr",
    ])
  })

  test("shipping non-goals do not become required proof", () => {
    const contract = SessionHarness.contract(
      "Run a shipping preflight and report readiness. Do not commit, push, open a PR, or deploy.",
    )
    expect(contract.requiredEvidence.map((item) => item.id)).toEqual(["scope", "tests", "git"])
    expect(contract.budgets.expectedFiles).toBe(0)
  })

  test("extracts explicit constraints, non-goals, evidence, and file scope", () => {
    const contract = SessionHarness.contract(
      "Change src/button.ts. Do not add dependencies. Run the targeted tests and ensure the typecheck passes.",
    )
    expect(contract.allowedScope).toContain("src/button.ts")
    expect(contract.nonGoals.some((item) => item.includes("Do not add dependencies"))).toBe(true)
    expect(contract.acceptanceCriteria.some((item) => item.includes("typecheck"))).toBe(true)
    expect(contract.requiredEvidence.map((item) => item.id)).toContain("tests")
    expect(contract.requiredEvidence.map((item) => item.id)).toContain("typecheck")
  })
})
