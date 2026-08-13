import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { BrowserSession } from "@/browser/session"
import * as Snapshot from "@/browser/snapshot"
import DESCRIPTION from "./browser.txt"

const NAVIGATE_TIMEOUT_MS = 20_000
const ACTION_TIMEOUT_MS = 5_000
const TEXT_LIMIT = 4_000

export const Parameters = Schema.Struct({
  action: Schema.Literals([
    "navigate",
    "snapshot",
    "click",
    "type",
    "screenshot",
    "text",
    "console",
    "back",
    "close",
  ]).annotate({ description: "The browser action to perform" }),
  url: Schema.optional(Schema.String).annotate({ description: "URL to open (action: navigate)" }),
  index: Schema.optional(Schema.Number).annotate({
    description: "Element index from the most recent snapshot (action: click, type)",
  }),
  value: Schema.optional(Schema.String).annotate({ description: "Text to fill into the element (action: type)" }),
})

type Metadata = {
  action: string
  url?: string
  title?: string
  elementCount?: number
}

export const BrowserTool = Tool.define<typeof Parameters, Metadata, BrowserSession.Service>(
  "browser",
  Effect.gen(function* () {
    const session = yield* BrowserSession.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          if (params.action === "close") {
            yield* session.close(ctx.sessionID)
            return { title: "browser closed", metadata: { action: "close" }, output: "Browser session closed." }
          }

          yield* ctx.ask({
            permission: "browser",
            patterns: [params.action, ...(params.url ? [params.url] : [])],
            always: [],
            metadata: { action: params.action, url: params.url },
          })

          const page = yield* session.page(ctx.sessionID)

          const snapshotOutput = Effect.fn("BrowserTool.snapshot")(function* () {
            const items = yield* Effect.tryPromise(() => Snapshot.elements(page))
            return {
              title: `${page.url()} (${items.length} interactive elements)`,
              metadata: { action: "snapshot", url: page.url(), title: yield* Effect.promise(() => page.title()), elementCount: items.length },
              output: [`URL: ${page.url()}`, Snapshot.format(items)].join("\n\n"),
            }
          })

          if (params.action === "navigate") {
            if (!params.url) return yield* Effect.fail(new Error("navigate requires a url"))
            const target = /^https?:\/\//i.test(params.url) ? params.url : `https://${params.url}`
            yield* Effect.tryPromise(() =>
              page.goto(target, { waitUntil: "domcontentloaded", timeout: NAVIGATE_TIMEOUT_MS }),
            ).pipe(
              Effect.catch((error) => Effect.fail(new Error(`Failed to navigate to ${target}: ${String(error)}`))),
            )
            return yield* snapshotOutput()
          }

          if (params.action === "snapshot") return yield* snapshotOutput()

          if (params.action === "click") {
            if (params.index === undefined) return yield* Effect.fail(new Error("click requires an index"))
            const locator = yield* Effect.promise(() => Snapshot.locate(page, params.index!))
            yield* Effect.tryPromise(() => locator.click({ timeout: ACTION_TIMEOUT_MS })).pipe(
              Effect.catch((error) =>
                Effect.fail(
                  new Error(
                    `Failed to click element ${params.index}: ${String(error)}. The page may have changed -- call snapshot again.`,
                  ),
                ),
              ),
            )
            yield* Effect.promise(() => page.waitForTimeout(150))
            return yield* snapshotOutput()
          }

          if (params.action === "type") {
            if (params.index === undefined) return yield* Effect.fail(new Error("type requires an index"))
            if (params.value === undefined) return yield* Effect.fail(new Error("type requires a value"))
            const locator = yield* Effect.promise(() => Snapshot.locate(page, params.index!))
            yield* Effect.tryPromise(() => locator.fill(params.value!, { timeout: ACTION_TIMEOUT_MS })).pipe(
              Effect.catch((error) =>
                Effect.fail(
                  new Error(
                    `Failed to type into element ${params.index}: ${String(error)}. The page may have changed -- call snapshot again.`,
                  ),
                ),
              ),
            )
            return yield* snapshotOutput()
          }

          if (params.action === "screenshot") {
            const bytes = yield* Effect.tryPromise(() => page.screenshot({ type: "png" }))
            return {
              title: page.url(),
              metadata: { action: "screenshot", url: page.url() },
              output: "Screenshot captured.",
              attachments: [
                {
                  type: "file" as const,
                  mime: "image/png",
                  url: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
                },
              ],
            }
          }

          if (params.action === "text") {
            const text = yield* Effect.tryPromise(() => page.innerText("body").catch(() => ""))
            const trimmed = text.trim().slice(0, TEXT_LIMIT)
            return {
              title: page.url(),
              metadata: { action: "text", url: page.url() },
              output: trimmed || "(page has no visible text)",
            }
          }

          if (params.action === "console") {
            const logs = yield* session.console(ctx.sessionID)
            return {
              title: `${logs.length} console message(s)`,
              metadata: { action: "console", url: page.url() },
              output: logs.length ? logs.join("\n") : "(no console messages captured)",
            }
          }

          // back
          yield* Effect.tryPromise(() => page.goBack({ waitUntil: "domcontentloaded", timeout: NAVIGATE_TIMEOUT_MS }))
          return yield* snapshotOutput()
        }).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
