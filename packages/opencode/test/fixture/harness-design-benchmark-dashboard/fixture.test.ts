import { expect, test } from "bun:test"

test("keeps the dashboard identity and data", async () => {
  const page = await Bun.file(`${import.meta.dir}/index.html`).text()
  expect(page).toContain("Pulse")
  expect(page).toContain("api-gateway")
  expect(page).toContain("<main")
})
