import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { chromium, type Browser, type Page } from "playwright"
import * as Snapshot from "../../src/browser/snapshot"

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }))
  page = await browser.newPage()
})

afterAll(async () => {
  await browser.close()
})

const FIXTURE = `<!doctype html>
<html><body>
  <button id="save">Save</button>
  <a href="/next">Next page</a>
  <input type="text" placeholder="Email address" />
  <div style="display:none"><button>Hidden</button></div>
</body></html>`

describe("browser snapshot", () => {
  test("tags visible interactive elements with a stable index", async () => {
    await page.setContent(FIXTURE)
    const items = await Snapshot.elements(page)

    expect(items.length).toBe(3)
    expect(items[0]).toMatchObject({ index: 0, tag: "button", label: "Save" })
    expect(items[1]).toMatchObject({ index: 1, tag: "a", label: "Next page" })
    expect(items[2]).toMatchObject({ index: 2, tag: "input", type: "text", label: "Email address" })
  })

  test("excludes hidden elements", async () => {
    await page.setContent(FIXTURE)
    const items = await Snapshot.elements(page)
    expect(items.some((item) => item.label === "Hidden")).toBe(false)
  })

  test("format renders a compact indexed list", async () => {
    await page.setContent(FIXTURE)
    const items = await Snapshot.elements(page)
    const output = Snapshot.format(items)
    expect(output).toContain("[0] <button> Save")
    expect(output).toContain("[2] <input type=text> Email address")
  })

  test("locate resolves the tagged element by index", async () => {
    await page.setContent(FIXTURE)
    await Snapshot.elements(page)
    const locator = await Snapshot.locate(page, 0)
    await locator.click()
    const buttonText = await page.locator("#save").textContent()
    expect(buttonText).toBe("Save")
  })
})
