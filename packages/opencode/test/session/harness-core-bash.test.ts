import { expect, test } from "bun:test"
import { HarnessCore } from "@/session/harness-core"
import { SessionHarness } from "@/session/harness"
import type { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { ModelID, ProviderID } from "@/provider/schema"

let sequence = 0

function tool(name: string, input: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
  const id = ++sequence
  const sessionID = SessionID.make("session-bash-proof")
  const messageID = MessageID.make(`msg-bash-proof-${id}`)
  return {
    info: {
      id: messageID,
      sessionID,
      role: "user",
      time: { created: id },
      agent: "build",
      model: { providerID: ProviderID.make("test"), modelID: ModelID.make("test") },
    },
    parts: [
      {
        id: PartID.make(`prt-bash-proof-${id}`),
        messageID,
        sessionID,
        type: "tool",
        callID: `call-bash-proof-${id}`,
        tool: name,
        state: { status: "completed", input, output: "ok", title: name, metadata, time: { start: 0, end: 1 } },
      },
    ],
  } as MessageV2.WithParts
}

test("the runtime bash tool satisfies requested test evidence", () => {
  const source = "/repo/src/ui.ts"
  const verification = "/repo/fixture.test.ts"
  const contract = SessionHarness.contract("Add buttonDisabled in src/ui.ts and add a focused test")
  const result = HarnessCore.proof(
    [
      tool("read", { filePath: source }),
      tool("edit", { filePath: source }, { filediff: { file: source, additions: 3, deletions: 0 } }),
      tool("read", { filePath: verification }),
      tool("edit", { filePath: verification }, { filediff: { file: verification, additions: 2, deletions: 0 } }),
      tool("bash", { command: "bun test fixture.test.ts" }, { exit: 0 }),
    ],
    contract,
  )

  expect(result.missing).toEqual([])
  expect(result.stop).toBe(true)
})
