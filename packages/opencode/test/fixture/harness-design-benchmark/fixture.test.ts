import { expect, test } from "bun:test"

test("keeps the booking journey and business identity", async () => {
  const page = await Bun.file(`${import.meta.dir}/index.html`).text()
  expect(page).toContain("Northline")
  expect(page).toContain("Book an assessment")
  expect(page).toContain("<main")
})
