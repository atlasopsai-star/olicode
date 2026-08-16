import path from "path"
import { Effect, Schema } from "effect"
import type { Page } from "playwright"
import * as Tool from "./tool"
import { BrowserSession } from "@/browser/session"
import * as Snapshot from "@/browser/snapshot"
import { InstanceState } from "@/effect/instance-state"
import DESCRIPTION from "./browser.txt"

const NAVIGATE_TIMEOUT_MS = 20_000
const ACTION_TIMEOUT_MS = 5_000
const TEXT_LIMIT = 4_000

// Only a bare hostname (no scheme at all) gets https:// assumed -- a URL that
// already names any scheme (file://, http://, etc.) is left alone. Local
// file:// URLs are the standard way to preview a built page without a dev
// server; blindly prefixing https:// broke them entirely.
export function resolveUrl(input: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`
}

export function resolveScreenshotPath(directory: string, input: string): string {
  const target = path.resolve(directory, input)
  const relative = path.relative(directory, target)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error("Screenshot paths must stay inside the active workspace. Use a relative path or omit path for inline review.")
  return target
}

export const Parameters = Schema.Struct({
  action: Schema.Literals([
    "navigate",
    "snapshot",
    "click",
    "type",
    "screenshot",
    "viewport",
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
  path: Schema.optional(Schema.String).annotate({
    description: "Optional workspace-relative path to save the screenshot instead of returning it inline (action: screenshot)",
  }),
  width: Schema.optional(Schema.Number).annotate({ description: "Viewport width in pixels (action: viewport)" }),
  height: Schema.optional(Schema.Number).annotate({ description: "Viewport height in pixels (action: viewport)" }),
})

type Params = Schema.Schema.Type<typeof Parameters>

type Metadata = {
  action: string
  url?: string
  title?: string
  elementCount?: number
}

type Result = {
  title: string
  metadata: Metadata
  output: string
  attachments?: Array<{ type: "file"; mime: string; url: string }>
}

async function snapshotResult(page: Page): Promise<Result> {
  const items = await Snapshot.elements(page)
  return {
    title: `${page.url()} (${items.length} interactive elements)`,
    metadata: { action: "snapshot", url: page.url(), title: await page.title(), elementCount: items.length },
    output: [`URL: ${page.url()}`, Snapshot.format(items)].join("\n\n"),
  }
}

// Runs entirely inside the session's serialized queue (see BrowserSession.run)
// so a concurrently-dispatched action can never observe or interrupt a page
// mid-navigation, mid-click, etc.
async function perform(page: Page, params: Params, screenshotPath: string | undefined): Promise<Result> {
  if (params.action === "navigate") {
    if (!params.url) throw new Error("navigate requires a url")
    const target = resolveUrl(params.url)
    try {
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: NAVIGATE_TIMEOUT_MS })
    } catch (error) {
      throw new Error(`Failed to navigate to ${target}: ${String(error)}`)
    }
    return snapshotResult(page)
  }

  if (params.action === "snapshot") return snapshotResult(page)

  if (params.action === "click") {
    if (params.index === undefined) throw new Error("click requires an index")
    const locator = await Snapshot.locate(page, params.index)
    try {
      await locator.click({ timeout: ACTION_TIMEOUT_MS })
    } catch (error) {
      throw new Error(
        `Failed to click element ${params.index}: ${String(error)}. The page may have changed -- call snapshot again.`,
      )
    }
    await page.waitForTimeout(150)
    return snapshotResult(page)
  }

  if (params.action === "type") {
    if (params.index === undefined) throw new Error("type requires an index")
    if (params.value === undefined) throw new Error("type requires a value")
    const locator = await Snapshot.locate(page, params.index)
    try {
      await locator.fill(params.value, { timeout: ACTION_TIMEOUT_MS })
    } catch (error) {
      throw new Error(
        `Failed to type into element ${params.index}: ${String(error)}. The page may have changed -- call snapshot again.`,
      )
    }
    return snapshotResult(page)
  }

  if (params.action === "screenshot") {
    if (screenshotPath) {
      await page.screenshot({ type: "png", path: screenshotPath })
      return {
        title: page.url(),
        metadata: { action: "screenshot", url: page.url() },
        output: `Screenshot saved to ${screenshotPath}.`,
      }
    }
    const bytes = await page.screenshot({ type: "png" })
    return {
      title: page.url(),
      metadata: { action: "screenshot", url: page.url() },
      output: "Screenshot captured.",
      attachments: [
        { type: "file", mime: "image/png", url: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}` },
      ],
    }
  }

  if (params.action === "viewport") {
    if (!params.width || !params.height) throw new Error("viewport requires positive width and height")
    await page.setViewportSize({ width: params.width, height: params.height })
    return {
      title: `${params.width}x${params.height}`,
      metadata: { action: "viewport", url: page.url() },
      output: `Viewport set to ${params.width}x${params.height}.`,
    }
  }

  if (params.action === "text") {
    const text = await page.innerText("body").catch(() => "")
    const trimmed = text.trim().slice(0, TEXT_LIMIT)
    return {
      title: page.url(),
      metadata: { action: "text", url: page.url() },
      output: trimmed || "(page has no visible text)",
    }
  }

  // back
  await page.goBack({ waitUntil: "domcontentloaded", timeout: NAVIGATE_TIMEOUT_MS })
  return snapshotResult(page)
}

export const BrowserTool = Tool.define<typeof Parameters, Metadata, BrowserSession.Service>(
  "browser",
  Effect.gen(function* () {
    const session = yield* BrowserSession.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context<Metadata>) =>
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

          if (params.action === "console") {
            const logs = yield* session.console(ctx.sessionID)
            return {
              title: `${logs.length} console message(s)`,
              metadata: { action: "console" },
              output: logs.length ? logs.join("\n") : "(no console messages captured)",
            }
          }

          const screenshotPath = yield* Effect.gen(function* () {
            if (params.action !== "screenshot" || !params.path) return undefined
            const instance = yield* InstanceState.context
            return resolveScreenshotPath(instance.directory, params.path)
          })

          return yield* session.run(ctx.sessionID, (page) => perform(page, params, screenshotPath))
        }).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
