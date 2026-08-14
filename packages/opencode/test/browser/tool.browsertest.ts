import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { BrowserTool } from "@/tool/browser"
import { BrowserSession } from "@/browser/session"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { Agent } from "@/agent/agent"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// This is the only test that drives BrowserTool.execute() itself (as opposed
// to BrowserSession or the pure resolveUrl helper) -- Tool.define's wrapper
// calls Agent.Service.get(ctx.agent) after every successful execute, which
// requires an instance context. Without it every action fails identically
// with "InstanceRef not provided", which is easy to mistake for a hang or a
// browser-launch failure when driving the tool ad hoc.
const it = testEffect(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer, BrowserSession.defaultLayer))

afterEach(async () => {
  await disposeAllInstances()
})

describe("tool.browser", () => {
  it.instance("navigates, snapshots, reads text, and screenshots a real local page end to end", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const html = [
        "<!doctype html><html><head><title>Fixture Page</title></head><body>",
        "<h1>OliCode Browser Harness fixture</h1>",
        '<button id="go">Click me</button>',
        "<script>document.getElementById('go').onclick = () => { document.title = 'clicked' }</script>",
        "</body></html>",
      ].join("")
      yield* Effect.promise(() => Bun.write(`${test.directory}/index.html`, html))

      const tool = yield* BrowserTool.pipe(Effect.flatMap((item) => item.init()))
      const sessionID = SessionID.make("ses_browser_tool_test")
      const ctx = (action: string) => ({
        sessionID,
        messageID: MessageID.make("msg_browser_tool_test"),
        callID: `call_${action}`,
        agent: "build",
        abort: AbortSignal.any([]),
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      })

      const navigate = yield* tool.execute(
        { action: "navigate", url: `file://${test.directory}/index.html` },
        ctx("navigate"),
      )
      expect(navigate.metadata.title).toBe("Fixture Page")
      expect(navigate.output).toContain("<button> Click me")

      const text = yield* tool.execute({ action: "text" }, ctx("text"))
      expect(text.output).toContain("OliCode Browser Harness fixture")

      const console_ = yield* tool.execute({ action: "console" }, ctx("console"))
      expect(console_.output).toBe("(no console messages captured)")

      const screenshot = yield* tool.execute({ action: "screenshot", path: "shot.png" }, ctx("screenshot"))
      expect(screenshot.output).toContain("Screenshot saved to")
      const saved = yield* Effect.promise(() => Bun.file(`${test.directory}/shot.png`).exists())
      expect(saved).toBe(true)

      yield* tool.execute({ action: "close" }, ctx("close"))
    }),
  )
})
