import { describe, expect, test } from "bun:test"
import { Design } from "../../src/session/design-contract"

describe("Design.brief", () => {
  test("detects product type and brand attributes from the query", () => {
    const result = Design.brief("Redesign our premium landing page for a luxury architecture studio")
    expect(result.productType).toBe("landing page")
    expect(result.brandAttributes).toContain("premium")
    expect(result.platform).toBe("web")
  })

  test("falls back to distinctive/purpose-built when no brand signal is present", () => {
    const result = Design.brief("Redesign the dashboard")
    expect(result.productType).toBe("dashboard")
    expect(result.brandAttributes).toEqual(["distinctive", "purpose-built"])
  })

  test("detects mobile platform", () => {
    expect(Design.brief("Design the onboarding flow for our iOS app").platform).toBe("mobile")
  })
})

describe("Design.contract", () => {
  test("always carries the anti-slop avoid list and responsive/accessibility requirements", () => {
    const active = Design.contract("Design a SaaS dashboard")
    expect(active.avoidPatterns.length).toBeGreaterThan(0)
    expect(active.responsiveRequirements.length).toBeGreaterThan(0)
    expect(active.accessibilityRequirements.length).toBeGreaterThan(0)
  })

  test("creates product-specific direction for a premium local service homepage", () => {
    const active = Design.contract(
      "Build a distinctive premium homepage for a climate company serving design-conscious homeowners.",
    )
    expect(active.brief.productType).toBe("local service homepage")
    expect(active.audience).toBe("design-conscious homeowners")
    expect(active.layoutDirection).toContain("editorial, asymmetrical")
    expect(active.typographyDirection).toContain("editorial display")
    expect(active.variance).toBe("high")
  })
})

describe("Design.checklist", () => {
  test("renders the brief and avoid patterns into a harness-injectable block", () => {
    const output = Design.checklist(Design.contract("Design a premium landing page"))
    expect(output).toContain("<olicode_design_contract>")
    expect(output).toContain("Product type: landing page")
    expect(output).toContain("premium")
    expect(output).toContain("100 unrelated AI-generated products")
    expect(output).toContain("</olicode_design_contract>")
  })
})
