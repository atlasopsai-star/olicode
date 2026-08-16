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

  test("binds repeated request text to the active user message", () => {
    const query = "Change src/header.ts button label"
    expect(SessionHarness.execution({ query, taskID: "message-1" }).contract.id).toBe("message-1")
    expect(SessionHarness.execution({ query, taskID: "message-2" }).contract.id).toBe("message-2")
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

  test("render does not ask standard tasks to repeat automatic scope enforcement", () => {
    const output = SessionHarness.render({
      agent: build,
      query: "Add a loading state using the existing component pattern and add a focused test",
    })

    expect(output).toContain("scope is enforced automatically")
    expect(output).toContain("do not spend a tool call rechecking it")
  })

  test("small debug tasks receive a focused root-cause workflow", () => {
    const output = SessionHarness.render({
      agent: build,
      query: "Fix the adult boundary bug in src/account.ts and add a regression test",
    })

    expect(output).toContain("run one focused regression command")
    expect(output).toContain("without todos")
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

  // Live-caught regression (OliBench SHIP lane, 2026-08-15): negation
  // detection was sentence-scoped, so a prompt that names the action once
  // descriptively ("...ready for a Vercel preview deploy") and forbids it
  // in a separate trailing sentence ("Do not ... deploy.") still demanded
  // deploy/browser/console evidence that could never be satisfied, and the
  // harness blocked completion forever. Same bug hit "pull request" /
  // "commit message" phrasing landing in a different sentence than the
  // "Do not commit, push, open a PR" prohibition.
  test("negation in a separate sentence still suppresses required proof", () => {
    const deployReadiness = SessionHarness.contract(
      "Run a shipping preflight and tell me whether this project is ready for a Vercel preview deploy. Do not commit, push, open a PR, or deploy.",
    )
    expect(deployReadiness.requiredEvidence.map((item) => item.id)).toEqual(["scope", "tests", "git"])

    const prPreparation = SessionHarness.contract(
      "Prepare this project for a pull request: update NOTES.md and draft a clear conventional commit message. Do not commit, push, open a PR, or deploy -- preparation only.",
    )
    expect(prPreparation.requiredEvidence.map((item) => item.id)).toEqual(["scope", "tests", "git"])
  })

  test("routes every basic shipping phrase to the ship action", () => {
    for (const query of [
      "commit this",
      "push this",
      "open a PR",
      "open a pull request for this",
      "deploy this",
      "give me a Vercel preview",
      "ship this",
    ])
      expect(SessionHarness.action(query)).toBe("ship")
  })

  // Live-caught regression (OliBench BROWSER lane, 2026-08-16): the BROWSER
  // word list only matched literal technical vocabulary, so natural
  // outcome-language browser-verification requests -- the exact phrasing the
  // product is supposed to support -- fell through to "change"/STANDARD,
  // pulling in change/tests evidence a "do not edit anything" verification
  // task could never satisfy.
  test("routes natural outcome-language browser verification requests to the browser action", () => {
    for (const query of [
      "Go through this site and make sure the checkout flow works end to end.",
      "Check this storefront at both a desktop width and a narrow mobile width and tell me what breaks or overlaps on mobile.",
      "Make sure the login flow works before we call this done.",
    ])
      expect(SessionHarness.action(query)).toBe("browser")
  })

  test("does not misfire browser on build/debug requests that merely mention similar words", () => {
    expect(SessionHarness.action("Add a checkout flow to this app")).not.toBe("browser")
    expect(SessionHarness.action("Build a checkout flow for this store")).not.toBe("browser")
    expect(SessionHarness.action("Fix the login bug on mobile")).not.toBe("browser")
  })

  // Live-caught regression (2026-08-16): "start"/"run" (as in launching a
  // process) weren't in MUTATION, so "start the dev server" fell through to
  // "answer" -- and classifyFile() hard-blocks ANY workspace mutation for
  // "answer" contracts, including writes that have nothing to do with
  // source code (a redirected log file, /dev/null). Reproduced live: the
  // model tried three different safe ways to background the server and
  // every one was blocked before it ever reached a real permission choice.
  test("routes start/run-a-process requests to the change action", () => {
    for (const query of ["start the dev server", "run the dev server", "start the app", "run npm run dev", "start it up"])
      expect(SessionHarness.action(query)).toBe("change")
  })

  test("does not misfire change on questions that merely mention start/run", () => {
    expect(SessionHarness.action("how does the server run")).not.toBe("change")
    expect(SessionHarness.action("why did it crash on start")).not.toBe("change")
  })

  test("does not misfire ship on unrelated prose that merely contains shipping-like substrings", () => {
    expect(SessionHarness.action("I'm fully committed to fixing this bug properly")).not.toBe("ship")
    expect(SessionHarness.action("Update the shipping address validation in checkout")).not.toBe("ship")
    expect(SessionHarness.action("Fix the typo in the header")).not.toBe("ship")
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

  // Live-caught regression: a debug report that names only the failing test
  // ("cart.test.js throws") previously narrowed allowedScope to exactly that
  // test file, hard-blocking every edit to the implementation file the test
  // actually exercises -- backwards for debugging, where the test names the
  // symptom and the fix belongs elsewhere. Confirmed live: apply_patch and
  // shell mutation to the real bug's file were both rejected as "outside the
  // explicit task scope" across four different fix attempts in one session.
  test("naming only a test file in the report does not lock scope to that file", () => {
    const contract = SessionHarness.contract(
      "This flow is broken: node cart.test.js throws instead of passing. Find the root cause and fix it.",
    )
    expect(contract.allowedScope).toEqual(["."])
  })

  test("naming an implementation file alongside a test file keeps the narrower scope", () => {
    const contract = SessionHarness.contract("Fix src/cart.ts; cart.test.ts currently fails.")
    expect(contract.allowedScope).toEqual(["src/cart.ts"])
  })
})
