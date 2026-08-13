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
  readonly run: <A>(sessionID: string, fn: (page: Page) => Promise<A>) => Effect.Effect<A>
  readonly console: (sessionID: string) => Effect.Effect<string[]>
  readonly close: (sessionID: string) => Effect.Effect<void>
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
    // Models are explicitly encouraged to parallelize independent tool calls,
    // but a single Playwright Page is not safe under concurrent actions (a
    // "close" racing a "screenshot" produces a blank capture, for example).
    // Every action for a session chains onto this queue, kept separate from
    // `entries` so it's available before the browser entry itself exists.
    const queues = new Map<string, Promise<unknown>>()

    const browser = () => {
      if (!browserPromise) browserPromise = launchBrowser()
      return browserPromise
    }

    async function sweep(except: string) {
      const now = Date.now()
      for (const [sessionID, entry] of entries) {
        if (sessionID === except) continue
        if (now - entry.lastUsed < IDLE_SWEEP_MS) continue
        entries.delete(sessionID)
        await entry.context.close().catch(() => {})
      }
    }

    async function ensureEntry(sessionID: string): Promise<Entry> {
      await sweep(sessionID)
      const existing = entries.get(sessionID)
      if (existing && !existing.page.isClosed()) {
        existing.lastUsed = Date.now()
        return existing
      }
      if (existing) entries.delete(sessionID)

      const active = await browser()
      const context = await active.newContext()
      const page = await context.newPage()
      const logs: string[] = []
      page.on("console", (msg) => {
        logs.push(`[${msg.type()}] ${msg.text()}`)
        if (logs.length > CONSOLE_LIMIT) logs.shift()
      })
      page.on("pageerror", (err) => {
        logs.push(`[pageerror] ${err.message}`)
        if (logs.length > CONSOLE_LIMIT) logs.shift()
      })
      const entry: Entry = { context, page, console: logs, lastUsed: Date.now() }
      entries.set(sessionID, entry)
      log.info("session started", { sessionID })
      return entry
    }

    function enqueue<A>(sessionID: string, fn: (entry: Entry) => Promise<A>): Promise<A> {
      const previous = queues.get(sessionID) ?? Promise.resolve()
      const result = previous.then(() => ensureEntry(sessionID).then(fn))
      queues.set(
        sessionID,
        result.then(
          () => undefined,
          () => undefined,
        ),
      )
      return result
    }

    const run = <A>(sessionID: string, fn: (page: Page) => Promise<A>) =>
      Effect.promise(() => enqueue(sessionID, (entry) => fn(entry.page)))

    const consoleLog = Effect.fn("BrowserSession.console")(function* (sessionID: string) {
      return entries.get(sessionID)?.console ?? []
    })

    const close = (sessionID: string) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          enqueue(sessionID, async (entry) => {
            entries.delete(sessionID)
            queues.delete(sessionID)
            await entry.context.close().catch(() => {})
          }),
        )
        log.info("session closed", { sessionID })
      })

    return Service.of({ run, console: consoleLog, close })
  }),
)

export const defaultLayer = layer

export * as BrowserSession from "./session"
