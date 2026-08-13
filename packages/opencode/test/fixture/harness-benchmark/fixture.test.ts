import { expect, test } from "bun:test"
import { isAdult } from "./src/account"
import { add } from "./src/math"
import { buttonLabel, loadingLabel } from "./src/ui"

test("fixture baseline", () => {
  expect(buttonLabel).toBeString()
  expect(loadingLabel(true)).toBe("Loading…")
  expect(add(2, 3)).toBe(5)
  expect(isAdult(19)).toBe(true)
})
