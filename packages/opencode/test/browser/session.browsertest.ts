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
        const first = yield* session.run("session-a", async (page) => page)
        const second = yield* session.run("session-a", async (page) => page)
        expect(first).toBe(second)
        yield* session.close("session-a")
      }),
    )
  })

  test("gives different sessions independent pages", async () => {
    await run(
      Effect.gen(function* () {
        const session = yield* BrowserSession.Service
        const a = yield* session.run("session-b", async (page) => page)
        const b = yield* session.run("session-c", async (page) => page)
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
        const page = yield* session.run("session-d", async (page) => page)
        yield* session.close("session-d")
        expect(page.isClosed()).toBe(true)
      }),
    )
  })

  test("launching a new page after close creates a fresh one", async () => {
    await run(
      Effect.gen(function* () {
        const session = yield* BrowserSession.Service
        const first = yield* session.run("session-e", async (page) => page)
        yield* session.close("session-e")
        const second = yield* session.run("session-e", async (page) => page)
        expect(second).not.toBe(first)
        expect(second.isClosed()).toBe(false)
        yield* session.close("session-e")
      }),
    )
  })

  test("serializes concurrent actions for the same session instead of racing them", async () => {
    await run(
      Effect.gen(function* () {
        const session = yield* BrowserSession.Service
        const order: string[] = []

        const slow = session.run("session-f", async (page) => {
          order.push("slow-start")
          await page.waitForTimeout(100)
          order.push("slow-end")
        })
        const fast = session.run("session-f", async () => {
          order.push("fast")
        })

        // Fire both "concurrently" (same as two tool calls dispatched together)
        // and confirm the second never interleaves with the first.
        yield* Effect.all([slow, fast], { concurrency: "unbounded" })

        expect(order).toEqual(["slow-start", "slow-end", "fast"])
        yield* session.close("session-f")
      }),
    )
  })

  test("a close queued mid-flight waits for the in-progress action instead of interrupting it", async () => {
    await run(
      Effect.gen(function* () {
        const session = yield* BrowserSession.Service
        const order: string[] = []

        const action = session.run("session-g", async (page) => {
          order.push("action-start")
          await page.waitForTimeout(100)
          order.push("action-end")
        })
        const close = session.close("session-g").pipe(Effect.tap(() => Effect.sync(() => order.push("closed"))))

        yield* Effect.all([action, close], { concurrency: "unbounded" })

        expect(order).toEqual(["action-start", "action-end", "closed"])
      }),
    )
  })
})
