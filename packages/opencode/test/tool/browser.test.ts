import { describe, expect, test } from "bun:test"
import { resolveUrl } from "../../src/tool/browser"

describe("browser resolveUrl", () => {
  test("assumes https for a bare hostname", () => {
    expect(resolveUrl("example.com")).toBe("https://example.com")
  })

  test("leaves an explicit https URL alone", () => {
    expect(resolveUrl("https://example.com/path")).toBe("https://example.com/path")
  })

  test("leaves an explicit http URL alone", () => {
    expect(resolveUrl("http://localhost:3000")).toBe("http://localhost:3000")
  })

  test("leaves a file:// URL alone", () => {
    expect(resolveUrl("file:///tmp/index.html")).toBe("file:///tmp/index.html")
  })
})
