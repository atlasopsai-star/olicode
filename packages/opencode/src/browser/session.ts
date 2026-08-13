import { Context, Effect, Layer } from "effect"
import type { Browser, BrowserContext, Page } from "playwright"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "browser-session" })

const IDLE_SWEEP_MS = 5 * 60_000
const CONSOLE_LIMIT = 50

type Entry = {
  context: BrowserContext
  page: Page
  console: string[]
  lastUsed: number
}

export interface Interface {
  readonly page: (sessionID: string) => Effect.Effect<Page>
  readonly console: (sessionID: string) => Effect.Effect<string[]>
  readonly close: (sessionID: string) => Effect.Effect<void>
  readonly touch: (sessionID: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/BrowserSession") {}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright")
  try {
    return await chromium.launch({ channel: "chrome", headless: true })
  } catch {
    return await chromium.launch({ headless: true })
  }
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // One Chrome process for every session in this instance, not one per
    // session -- sessions get isolated BrowserContexts (separate cookies/
    // storage), which are cheap, instead of separate OS processes, which
    // are not. Launched lazily on first use, shared for the process lifetime.
    let browserPromise: Promise<Browser> | undefined
    const entries = new Map<string, Entry>()

    const browser = Effect.fn("BrowserSession.browser")(function* () {
      if (!browserPromise) browserPromise = launchBrowser()
      return yield* Effect.promise(() => browserPromise!)
    })

    const sweep = Effect.fn("BrowserSession.sweep")(function* (except: string) {
      const now = Date.now()
      for (const [sessionID, entry] of entries) {
        if (sessionID === except) continue
        if (now - entry.lastUsed < IDLE_SWEEP_MS) continue
        entries.delete(sessionID)
        yield* Effect.promise(() => entry.context.close()).pipe(Effect.catch(() => Effect.void))
      }
    })

    const page = Effect.fn("BrowserSession.page")(function* (sessionID: string) {
      yield* sweep(sessionID)
      const existing = entries.get(sessionID)
      if (existing && !existing.page.isClosed()) {
        existing.lastUsed = Date.now()
        return existing.page
      }
      if (existing) entries.delete(sessionID)

      const active = yield* browser()
      const context = yield* Effect.promise(() => active.newContext())
      const page = yield* Effect.promise(() => context.newPage())
      const logs: string[] = []
      page.on("console", (msg) => {
        logs.push(`[${msg.type()}] ${msg.text()}`)
        if (logs.length > CONSOLE_LIMIT) logs.shift()
      })
      page.on("pageerror", (err) => {
        logs.push(`[pageerror] ${err.message}`)
        if (logs.length > CONSOLE_LIMIT) logs.shift()
      })
      entries.set(sessionID, { context, page, console: logs, lastUsed: Date.now() })
      log.info("session started", { sessionID })
      return page
    })

    const consoleLog = Effect.fn("BrowserSession.console")(function* (sessionID: string) {
      return entries.get(sessionID)?.console ?? []
    })

    const close = Effect.fn("BrowserSession.close")(function* (sessionID: string) {
      const existing = entries.get(sessionID)
      if (!existing) return
      entries.delete(sessionID)
      yield* Effect.promise(() => existing.context.close()).pipe(Effect.catch(() => Effect.void))
      log.info("session closed", { sessionID })
    })

    const touch = Effect.fn("BrowserSession.touch")(function* (sessionID: string) {
      const existing = entries.get(sessionID)
      if (existing) existing.lastUsed = Date.now()
    })

    return Service.of({ page, console: consoleLog, close, touch })
  }),
)

export const defaultLayer = layer

export * as BrowserSession from "./session"
