import { describe, expect, test } from "bun:test"
import { Ship } from "../../src/session/ship-contract"

describe("Ship.classify", () => {
  test("preflight-only when external actions are non-goals", () => {
    expect(Ship.classify("Run a shipping preflight. Do not commit, push, open a PR, or deploy.")).toBe("preflight")
  })

  test("commit-only for a plain commit request", () => {
    expect(Ship.classify("Commit this.")).toBe("commit")
  })

  test("push for a push request", () => {
    expect(Ship.classify("Push this.")).toBe("push")
  })

  test("pr for a pull request", () => {
    expect(Ship.classify("Open a PR.")).toBe("pr")
    expect(Ship.classify("Open a pull request for this change.")).toBe("pr")
  })

  test("deploy for a preview/deploy/vercel request", () => {
    expect(Ship.classify("Deploy preview.")).toBe("deploy")
    expect(Ship.classify("Push this and give me a working Vercel preview.")).toBe("deploy")
  })
})

describe("Ship.contract", () => {
  test("commit scope stops before push", () => {
    const active = Ship.contract("Commit this.")
    expect(active.scope).toBe("commit")
    expect(active.steps.some((step) => step.includes("ship(push)"))).toBe(false)
  })

  test("push scope does not include PR or deploy", () => {
    const active = Ship.contract("Push this.")
    expect(active.scope).toBe("push")
    expect(active.steps.some((step) => step.includes("ship(push)"))).toBe(true)
    expect(active.steps.some((step) => step.includes("ship(pr)"))).toBe(false)
    expect(active.steps.some((step) => step.includes("ship(deploy)"))).toBe(false)
  })

  test("deploy scope includes browser verification of the preview", () => {
    const active = Ship.contract("Push this and give me a working Vercel preview.")
    expect(active.scope).toBe("deploy")
    expect(active.steps.some((step) => step.includes("ship(deploy)"))).toBe(true)
    expect(active.steps.some((step) => /browser tool/i.test(step))).toBe(true)
    expect(active.steps.some((step) => step.includes("ship(push)"))).toBe(false)
  })
})

describe("Ship.checklist", () => {
  test("renders the scope and steps into a harness-injectable block", () => {
    const output = Ship.checklist(Ship.contract("Push this."))
    expect(output).toContain("<olicode_ship_contract>")
    expect(output).toContain("Scope: push")
    expect(output).toContain("permission prompt")
    expect(output).toContain("</olicode_ship_contract>")
  })
})
