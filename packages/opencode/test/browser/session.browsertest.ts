import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { BrowserSession } from "../../src/browser/session"

function run<A>(effect: Effect.Effect<A, never, BrowserSession.Service>) {
  return Effect.runPromise(effect.pipe(Effect.provide(BrowserSession.defaultLayer)))
}

describe("BrowserSession", () => {
  test("reuses the same page for repeat calls with the same session id", async () => {
    await run(
      Effect.gen(function* () {
        const session = yield* BrowserSession.Service
        const first = yield* session.page("session-a")
        const second = yield* session.page("session-a")
        expect(first).toBe(second)
        yield* session.close("session-a")
      }),
    )
  })

  test("gives different sessions independent pages", async () => {
    await run(
      Effect.gen(function* () {
        const session = yield* BrowserSession.Service
        const a = yield* session.page("session-b")
        const b = yield* session.page("session-c")
        expect(a).not.toBe(b)
        yield* session.close("session-b")
        yield* session.close("session-c")
      }),
    )
  })

  test("close actually closes the page", async () => {
    await run(
      Effect.gen(function* () {
        const session = yield* BrowserSession.Service
        const page = yield* session.page("session-d")
        yield* session.close("session-d")
        expect(page.isClosed()).toBe(true)
      }),
    )
  })

  test("launching a new page after close creates a fresh one", async () => {
    await run(
      Effect.gen(function* () {
        const session = yield* BrowserSession.Service
        const first = yield* session.page("session-e")
        yield* session.close("session-e")
        const second = yield* session.page("session-e")
        expect(second).not.toBe(first)
        expect(second.isClosed()).toBe(false)
        yield* session.close("session-e")
      }),
    )
  })
})
