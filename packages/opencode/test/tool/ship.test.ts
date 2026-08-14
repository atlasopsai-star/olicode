import { afterEach, describe, expect, test } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { extractDeploymentUrl, ShipTool } from "@/tool/ship"
import { Tool } from "@/tool/tool"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { ModelID, ProviderID } from "@/provider/schema"
import type { MessageV2 } from "@/session/message-v2"
import { Truncate } from "@/tool/truncate"
import { Agent } from "@/agent/agent"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer, CrossSpawnSpawner.defaultLayer))

const preflight = {
  info: {
    id: MessageID.make("msg_ship_preflight"),
    sessionID: SessionID.make("ses_ship_preflight"),
    role: "user",
    time: { created: 1 },
    agent: "build",
    model: { providerID: ProviderID.make("test"), modelID: ModelID.make("test") },
  },
  parts: [
    {
      id: PartID.make("prt_ship_preflight"),
      messageID: MessageID.make("msg_ship_preflight"),
      sessionID: SessionID.make("ses_ship_preflight"),
      type: "tool",
      callID: "call_ship_preflight",
      tool: "ship",
      state: {
        status: "completed",
        input: { action: "preflight" },
        output: "done",
        title: "ship preflight",
        metadata: {},
        time: { start: 0, end: 1 },
      },
    },
  ],
} as MessageV2.WithParts

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

  it.instance("preflight reports a missing origin remote instead of failing", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.$`git init -q`.cwd(test.directory).quiet())
      const result = yield* run({ action: "preflight" })
      expect(result.metadata.status).toBe("success")
      expect(result.output).toContain("(no origin)")
    }),
  )

  it.instance("preflight reports Vercel as not linked when no project.json exists", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.$`git init -q`.cwd(test.directory).quiet())
      const result = yield* run({ action: "preflight" })
      expect(result.output).toContain("Vercel not linked")
    }),
  )

  it.instance("preflight surfaces a dirty worktree instead of hiding it", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.$`git init -q`.cwd(test.directory).quiet())
      yield* Effect.promise(() => Bun.write(`${test.directory}/scratch.txt`, "untracked"))
      const result = yield* run({ action: "preflight" })
      expect(result.output).toContain("scratch.txt")
    }),
  )

  it.instance("commit rejects a missing file list with a clear message, not a raw crash", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.$`git init -q`.cwd(test.directory).quiet())
      const tool = yield* ShipTool.pipe(Effect.flatMap((item) => item.init()))
      const exit = yield* Effect.exit(
        tool.execute(
          { action: "commit", message: "docs: test" },
          {
            sessionID: SessionID.make("ses_ship_commit_test"),
            messageID: MessageID.make("msg_ship_commit_test"),
            callID: "call_ship_commit_test",
            agent: "build",
            abort: AbortSignal.any([]),
            messages: [preflight],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        ),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit))
        expect(Cause.prettyErrors(exit.cause).map((error) => error.message).join("\n")).toContain(
          "commit requires explicit files",
        )
    }),
  )

  it.instance("push against a repo with no configured remote fails with a specific, actionable message", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.$`git init -q`.cwd(test.directory).quiet())
      yield* Effect.promise(() => Bun.$`git -c user.email=t@t.com -c user.name=t commit -q --allow-empty -m init`.cwd(test.directory).quiet())
      const tool = yield* ShipTool.pipe(Effect.flatMap((item) => item.init()))
      const exit = yield* Effect.exit(
        tool.execute(
          { action: "push" },
          {
            sessionID: SessionID.make("ses_ship_push_test"),
            messageID: MessageID.make("msg_ship_push_test"),
            callID: "call_ship_push_test",
            agent: "build",
            abort: AbortSignal.any([]),
            messages: [preflight],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        ),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit))
        expect(Cause.prettyErrors(exit.cause).map((error) => error.message).join("\n")).toContain("git push failed")
    }),
  )
})

describe("tool.ship extractDeploymentUrl", () => {
  // Live-caught regression: recent Vercel CLI versions emit a trailing JSON
  // summary (on stdout) when they detect an agent environment. That JSON's
  // deploymentApiUrl field also matches /https:\/\/.../ and sorts after the
  // real deployment.url, so a naive "last https URL in the output" scan
  // silently returned the API endpoint instead of the browsable deployment.
  test("prefers deployment.url from a trailing Vercel JSON summary over deploymentApiUrl", () => {
    const output = JSON.stringify({
      status: "ok",
      deployment: {
        id: "dpl_123",
        url: "https://ship-roundtrip-abc123-team.vercel.app",
        inspectorUrl: "https://vercel.com/team/ship-roundtrip/dpl_123",
        readyState: "READY",
        target: null,
        deploymentApiUrl: "https://api.vercel.com/v13/deployments/dpl_123",
      },
      message: "Deployment ready.",
    })
    expect(extractDeploymentUrl(output)).toBe("https://ship-roundtrip-abc123-team.vercel.app")
  })

  test("falls back to regex extraction for plain-text CLI output with no JSON summary", () => {
    const output = [
      "Retrieving project…",
      "Deploying team/project",
      "  Inspect     https://vercel.com/team/project/dpl_456",
      "  Preview     https://project-def456-team.vercel.app",
    ].join("\n")
    expect(extractDeploymentUrl(output)).toBe("https://project-def456-team.vercel.app")
  })

  test("regex fallback excludes a trailing quote so the URL is never mangled", () => {
    const output = 'artifact captured mid-json: "https://project-ghi789-team.vercel.app"'
    expect(extractDeploymentUrl(output)).toBe("https://project-ghi789-team.vercel.app")
  })

  test("returns undefined when no URL is present anywhere in the output", () => {
    expect(extractDeploymentUrl("Building…\nno url here")).toBeUndefined()
  })
})
