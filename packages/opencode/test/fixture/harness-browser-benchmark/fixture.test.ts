import { expect, test } from "bun:test"

test("keeps the storefront structure and cart flow intact", async () => {
  const page = await Bun.file(`${import.meta.dir}/index.html`).text()
  expect(page).toContain("Fernway Goods")
  expect(page).toContain("add-to-cart")
  expect(page).toContain("checkout-form")
  expect(page).toContain("order-confirmation")
})
