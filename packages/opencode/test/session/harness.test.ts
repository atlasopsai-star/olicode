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
    expect(SessionHarness.classify("Use the browser to test checkout and login flow")).toBe("browser")
  })

  test("classify picks design tasks", () => {
    expect(SessionHarness.classify("Redesign the landing page UI with more visual polish and premium typography")).toBe("design")
  })

  test("render injects concise focus rules", () => {
    const output = SessionHarness.render({
      agent: build,
      query: "Fix the failing auth tests and keep the answer short",
    })

    expect(output).toContain("Mode: debug")
    expect(output).toContain("Keep progress updates and final answers short, direct, and high-signal.")
    expect(output).toContain("Do not repeat the user's request")
    expect(output).toContain("Find the root cause before changing code")
  })

  test("execution returns browser workflow metadata", () => {
    expect(
      SessionHarness.execution({ query: "Use the browser to test checkout login flow and capture DOM state" }),
    ).toEqual({
      mode: "browser",
      objective: "Use the browser to test checkout login flow and capture DOM state",
      browser: {
        objective: "Use the browser to test checkout login flow and capture DOM state",
        checkpoints: ["use", "browser", "test", "checkout", "login", "flow"],
      },
    })
  })
})
