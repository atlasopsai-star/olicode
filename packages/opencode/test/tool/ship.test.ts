import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ShipTool } from "@/tool/ship"
import { Tool } from "@/tool/tool"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { Agent } from "@/agent/agent"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer, CrossSpawnSpawner.defaultLayer))

afterEach(async () => {
  await disposeAllInstances()
})

const run = Effect.fn("ShipToolTest.run")(function* (args: Tool.InferParameters<typeof ShipTool>) {
  const tool = yield* ShipTool.pipe(Effect.flatMap((item) => item.init()))
  return yield* tool.execute(args, {
    sessionID: SessionID.make("ses_ship_test"),
    messageID: MessageID.make("msg_ship_test"),
    callID: "call_ship_test",
    agent: "build",
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.die("preflight must not request permission"),
  })
})

describe("tool.ship", () => {
  it.instance("runs read-only preflight without asking permission", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.$`git init -q`.cwd(test.directory).quiet())
      const result = yield* run({ action: "preflight" })
      expect(result.metadata.action).toBe("preflight")
      expect(result.output).toContain("status: success")
      expect(result.output).toContain("next_actions:")
    }),
  )
})
