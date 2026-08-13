import { describe, expect, test } from "bun:test"
import { ScopeGuard } from "../../src/session/scope-guard"
import type { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { ProviderID, ModelID } from "../../src/provider/schema"

let seq = 0

function toolPart(input: {
  tool: string
  toolInput?: Record<string, unknown>
  metadata?: Record<string, unknown>
}): MessageV2.WithParts {
  seq++
  const sessionID = SessionID.make("session-scope-1")
  const messageID = MessageID.make(`msg_scope-${seq}`)

  return {
    info: {
      id: messageID,
      sessionID,
      role: "user",
      time: { created: 0 },
      agent: "build",
      model: {
        providerID: ProviderID.make("anthropic"),
        modelID: ModelID.make("claude-sonnet-4-20250514"),
      },
    },
    parts: [
      {
        id: PartID.make(`prt_scope-${seq}`),
        messageID,
        sessionID,
        type: "tool",
        callID: `call-scope-${seq}`,
        tool: input.tool,
        state: {
          status: "completed",
          input: input.toolInput ?? {},
          output: "done",
          title: input.tool,
          metadata: input.metadata ?? {},
          time: { start: 0, end: 1 },
        },
      },
    ],
  } as MessageV2.WithParts
}

const read = (filePath: string) => toolPart({ tool: "read", toolInput: { filePath } })
const edit = (filePath: string) => toolPart({ tool: "edit", toolInput: { filePath } })
const write = (filePath: string) => toolPart({ tool: "write", toolInput: { filePath } })
const patch = (filePaths: string[]) =>
  toolPart({ tool: "apply_patch", metadata: { files: filePaths.map((filePath) => ({ filePath })) } })

describe("ScopeGuard.scan", () => {
  test("edited files that were read first are not flagged", () => {
    const report = ScopeGuard.scan([read("src/a.ts"), edit("src/a.ts")])
    expect(report.edited).toEqual(["src/a.ts"])
    expect(report.unexamined).toEqual([])
  })

  test("edited files never read are flagged as unexamined", () => {
    const report = ScopeGuard.scan([read("src/a.ts"), edit("src/a.ts"), edit("src/unrelated.ts")])
    expect(report.edited).toEqual(["src/a.ts", "src/unrelated.ts"])
    expect(report.unexamined).toEqual(["src/unrelated.ts"])
  })

  test("write and apply_patch are tracked the same way as edit", () => {
    const report = ScopeGuard.scan([write("src/new.ts"), patch(["src/b.ts", "src/c.ts"])])
    expect(report.edited).toEqual(["src/b.ts", "src/c.ts", "src/new.ts"])
    expect(report.unexamined).toEqual(["src/b.ts", "src/c.ts", "src/new.ts"])
  })

  test("empty conversation yields empty report", () => {
    expect(ScopeGuard.scan([])).toEqual({ seen: [], edited: [], unexamined: [] })
  })
})
