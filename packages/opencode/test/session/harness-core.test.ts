import { describe, expect, test } from "bun:test"
import { HarnessCore } from "../../src/session/harness-core"
import { SessionHarness } from "../../src/session/harness"
import type { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { ModelID, ProviderID } from "../../src/provider/schema"

let sequence = 0

function tool(tool: string, input: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
  sequence++
  const sessionID = SessionID.make("session-core")
  const messageID = MessageID.make(`msg-core-${sequence}`)
  return {
    info: {
      id: messageID,
      sessionID,
      role: "user",
      time: { created: sequence },
      agent: "build",
      model: { providerID: ProviderID.make("test"), modelID: ModelID.make("test") },
    },
    parts: [
      {
        id: PartID.make(`prt-core-${sequence}`),
        messageID,
        sessionID,
        type: "tool",
        callID: `call-core-${sequence}`,
        tool,
        state: { status: "completed", input, output: "done", title: tool, metadata, time: { start: 0, end: 1 } },
      },
    ],
  } as MessageV2.WithParts
}

describe("harness core", () => {
  test("proof gate stops after change, validation, and clean scope evidence", () => {
    const filePath = "/repo/src/button.ts"
    const result = HarnessCore.proof(
      [
        tool("read", { filePath }),
        tool("edit", { filePath }, { filediff: { file: filePath, additions: 1, deletions: 1 } }),
        tool("shell", { command: "bun test button.test.ts" }, { exit: 0 }),
      ],
      SessionHarness.contract("Change src/button.ts label"),
    )
    expect(result.stop).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.telemetry.filesChanged).toBe(1)
    expect(result.telemetry.additions).toBe(1)
  })

  test("proof gate rejects unsupported completion", () => {
    const result = HarnessCore.proof([], SessionHarness.contract("Change src/button.ts label"))
    expect(result.stop).toBe(false)
    expect(result.missing).toEqual(["change", "validation"])
  })

  test("telemetry detects repeated exploration", () => {
    const messages = [
      tool("read", { filePath: "/repo/src/button.ts" }),
      tool("read", { filePath: "/repo/src/button.ts" }),
      tool("grep", { pattern: "button" }),
      tool("grep", { pattern: "button" }),
    ]
    expect(HarnessCore.telemetry(messages).repeatedReads).toBe(1)
    expect(HarnessCore.telemetry(messages).repeatedSearches).toBe(1)
  })

  test("response controller removes filler and caps tight responses", () => {
    expect(HarnessCore.response("Sure! Fixed it.")).toBe("Fixed it.")
    expect(HarnessCore.response(`Result\n\n\n${"x".repeat(2_100)}`)).toEndWith("[Response shortened by OliHarness]")
  })

  test("rollback candidates require a task-created unchanged file", () => {
    const filePath = "/repo/unrelated.ts"
    const messages = [tool("write", { filePath, content: "export {}\n" }, { exists: false })]
    const result = HarnessCore.proof(messages, SessionHarness.contract("Change src/button.ts label"))
    expect(HarnessCore.rollbackCandidates(messages, result)).toEqual([{ file: filePath, content: "export {}\n" }])
    expect(HarnessCore.proof(messages, SessionHarness.contract("Change src/button.ts label"), [filePath]).stop).toBe(
      false,
    )
  })
})
