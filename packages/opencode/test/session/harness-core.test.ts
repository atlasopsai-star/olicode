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

// Mirrors the shape a permission-denied tool call actually has (observed
// live: ship(commit) and a screenshot-deleting `rm` both denied this way) --
// status "error", no metadata at all, not the "completed" shape `tool()` produces.
function deniedTool(name: string, input: Record<string, unknown>) {
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
        tool: name,
        state: {
          status: "error",
          input,
          error: "The user rejected permission to use this specific tool call.",
          time: { start: 0, end: 1 },
        },
      },
    ],
  } as MessageV2.WithParts
}

describe("harness core", () => {
  test("design implementation drops discovery tools after the first mutation", () => {
    const tools = Object.fromEntries(
      ["bash", "read", "glob", "grep", "task", "webfetch", "todowrite", "skill", "apply_patch", "browser"].map(
        (name) => [name, name],
      ),
    )
    expect(Object.keys(HarnessCore.focusDesignTools(tools, [tool("read", { filePath: "/repo/index.html" })]))).toEqual(
      Object.keys(tools),
    )
    expect(
      Object.keys(HarnessCore.focusDesignTools(tools, [tool("apply_patch", { patchText: "update index.html" })])),
    ).toEqual(["bash", "read", "apply_patch", "browser"])
  })

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

  test("proof gate blocks an unrelated file found only in the real workspace diff", () => {
    const result = HarnessCore.proof(
      [tool("shell", { command: "bun test" }, { exit: 0 })],
      SessionHarness.contract("Change src/button.ts label"),
      [],
      ["/repo/unrelated.ts"],
    )

    expect(result.stop).toBe(false)
    expect(result.scope).toContainEqual({
      file: "/repo/unrelated.ts",
      classification: "UNRELATED",
      reason: "The path is outside the explicit task scope.",
    })
  })

  test("real workspace evidence supports an explicitly scoped shell mutation", () => {
    const result = HarnessCore.proof(
      [tool("shell", { command: "sed -i s/Save/Continue/ src/button.ts && bun test" }, { exit: 0 })],
      SessionHarness.contract("Change src/button.ts label"),
      [],
      ["/repo/src/button.ts"],
    )

    expect(result.stop).toBe(true)
    expect(result.satisfied).toEqual(["change", "validation", "scope"])
    expect(result.telemetry.filesChanged).toBe(1)
  })

  test("FAST accepts a post-mutation reread as targeted validation", () => {
    const filePath = "/repo/src/button.ts"
    const contract = SessionHarness.contract("Change the label in src/button.ts")
    const result = HarnessCore.proof(
      [
        tool("read", { filePath }),
        tool("edit", { filePath }, { filediff: { file: filePath, additions: 1, deletions: 1 } }),
        tool("read", { filePath }),
      ],
      contract,
    )
    expect(contract.rigor).toBe("FAST")
    expect(result.stop).toBe(true)
    expect(result.missing).toEqual([])
  })

  test("FAST does not accept a read that happened before mutation", () => {
    const filePath = "/repo/src/button.ts"
    const result = HarnessCore.proof(
      [tool("read", { filePath }), tool("edit", { filePath }, { filediff: { file: filePath } })],
      SessionHarness.contract("Change the label in src/button.ts"),
    )
    expect(result.stop).toBe(false)
    expect(result.missing).toContain("validation")
  })

  test("DESIGN requires wide and narrow screenshots plus console evidence", () => {
    const filePath = "/repo/src/page.tsx"
    const contract = SessionHarness.contract("Redesign the landing page UI in src/page.tsx")
    const base = [
      tool("read", { filePath }),
      tool("edit", { filePath }, { filediff: { file: filePath, additions: 4, deletions: 2 } }),
      tool("shell", { command: "bun run build" }, { exit: 0 }),
      tool("browser", { action: "navigate", url: "http://localhost:3000" }),
      tool("browser", { action: "screenshot" }),
    ]
    expect(HarnessCore.proof(base, contract).missing).toEqual(["narrow-screenshot", "console"])
    expect(
      HarnessCore.proof(
        [
          ...base,
          tool("browser", { action: "viewport", width: 390, height: 844 }),
          tool("browser", { action: "screenshot" }),
          tool("browser", { action: "console" }),
        ],
        contract,
      ).stop,
    ).toBe(true)
  })

  test("DESIGN classifies its saved browser screenshots as verification evidence", () => {
    const contract = SessionHarness.contract("Redesign index.html and capture wide and narrow screenshots")
    const screenshot = "/repo/artifacts/wide.png"
    const result = HarnessCore.proof(
      [
        tool("read", { filePath: "/repo/index.html" }),
        tool("apply_patch", { patchText: "update index.html" }, { files: [{ filePath: "/repo/index.html" }] }),
        tool("bash", { command: "bun run build" }, { exit: 0 }),
        tool("browser", { action: "navigate", url: "file:///repo/index.html" }),
        tool("browser", { action: "viewport", width: 1440, height: 900 }),
        tool("browser", { action: "screenshot", path: screenshot }),
        tool("browser", { action: "viewport", width: 390, height: 844 }),
        tool("browser", { action: "screenshot" }),
        tool("browser", { action: "console" }),
      ],
      contract,
      [],
      [screenshot],
    )
    expect(result.scope).toContainEqual({
      file: screenshot,
      classification: "VERIFICATION",
      reason: "The file is a required browser screenshot from this design task.",
    })
    expect(result.stop).toBe(true)
  })

  test("DESIGN stops exposing tools once required evidence is complete", () => {
    const contract = SessionHarness.contract("Redesign index.html and capture wide and narrow screenshots")
    const messages = [
      tool("read", { filePath: "/repo/index.html" }),
      tool("apply_patch", { patchText: "update index.html" }, { files: [{ filePath: "/repo/index.html" }] }),
      tool("bash", { command: "bun run build" }, { exit: 0 }),
      tool("browser", { action: "navigate", url: "file:///repo/index.html" }),
      tool("browser", { action: "viewport", width: 1440, height: 900 }),
      tool("browser", { action: "screenshot" }),
      tool("browser", { action: "viewport", width: 390, height: 844 }),
      tool("browser", { action: "screenshot" }),
      tool("browser", { action: "console" }),
    ]
    expect(HarnessCore.designEvidenceComplete(messages, contract)).toBe(true)
    expect(HarnessCore.designEvidenceComplete(messages.slice(0, -1), contract)).toBe(false)
  })

  // Live-caught regression: after gathering full design evidence, the model
  // tried to delete its own screenshots (apply_patch delete + bash rm), both
  // correctly denied by the permission gate. Confirm a denied delete attempt
  // sitting in history neither corrupts evidence tracking nor blocks
  // completion -- the harness's job is to make deleting evidence pointless,
  // not to crash or misreport when a model tries anyway.
  test("a denied attempt to delete required screenshots does not break proof or block completion", () => {
    const filePath = "/repo/src/page.tsx"
    const contract = SessionHarness.contract("Redesign the landing page UI in src/page.tsx")
    const complete = [
      tool("read", { filePath }),
      tool("edit", { filePath }, { filediff: { file: filePath, additions: 4, deletions: 2 } }),
      tool("shell", { command: "bun run build" }, { exit: 0 }),
      tool("browser", { action: "navigate", url: "http://localhost:3000" }),
      tool("browser", { action: "screenshot" }),
      tool("browser", { action: "viewport", width: 390, height: 844 }),
      tool("browser", { action: "screenshot" }),
      tool("browser", { action: "console" }),
      deniedTool("apply_patch", { patchText: "*** Delete File: wide.png" }),
      deniedTool("bash", { command: "rm wide.png narrow.png" }),
    ]
    const result = HarnessCore.proof(complete, contract)
    expect(result.missing).toEqual([])
    expect(result.stop).toBe(true)
  })

  test("SHIP records deterministic shipping and deployed browser proof", () => {
    const filePath = "/repo/src/page.tsx"
    const result = HarnessCore.proof(
      [
        tool("read", { filePath }),
        tool("edit", { filePath }, { filediff: { file: filePath, additions: 1, deletions: 1 } }),
        tool("shell", { command: "bun test" }, { exit: 0 }),
        tool("ship", { action: "deploy" }),
        tool("browser", { action: "navigate", url: "https://preview.example" }),
        tool("browser", { action: "console" }),
      ],
      SessionHarness.contract("Deploy src/page.tsx to Vercel and verify it"),
    )
    expect(result.stop).toBe(true)
    expect(result.missing).toEqual([])
  })

  test("raw shell shipping commands do not satisfy deterministic ship proof", () => {
    const contract = SessionHarness.contract("Run tests and a shipping preflight. Do not commit, push, or deploy.")
    const result = HarnessCore.proof(
      [
        tool("shell", { command: "bun test" }, { exit: 0 }),
        tool("shell", { command: "git status --short" }, { exit: 0 }),
      ],
      contract,
    )
    expect(result.missing).toContain("git")
    expect(result.stop).toBe(false)
  })

  test("detects completed deterministic ship preflight", () => {
    expect(HarnessCore.hasCompletedToolAction([tool("ship", { action: "preflight" })], "ship", "preflight")).toBe(true)
    expect(HarnessCore.hasCompletedToolAction([tool("shell", { command: "git status" })], "ship", "preflight")).toBe(false)
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

  test("task telemetry excludes earlier requests in a long session", () => {
    const previous = tool("read", { filePath: "/repo/previous.ts" })
    const active = tool("read", { filePath: "/repo/active.ts" })
    const messages = HarnessCore.taskMessages([previous, active], active.info.id)

    expect(messages).toEqual([active])
    expect(HarnessCore.telemetry(messages).filesRead).toBe(1)
  })

  test("telemetry records operational phase and tool durations", () => {
    const timings: HarnessCore.LifecycleTimings = {
      contractMs: 1,
      worktreeMs: 2,
      toolAssemblyMs: 3,
      contextAssemblyMs: 4,
      modelAndToolsMs: 5,
      proofMs: 6,
      persistenceMs: 7,
    }
    const context: HarnessCore.ContextTelemetry = {
      systemPromptChars: 100,
      toolSurfaceChars: 200,
      modelMessages: 3,
      exposedTools: ["read", "apply_patch"],
    }
    const result = HarnessCore.telemetry(
      [tool("read", { filePath: "/repo/active.ts" }), tool("shell", { command: "bun test" }, { exit: 0 })],
      timings,
      context,
    )

    expect(result.toolDurationMs).toBe(2)
    expect(result.timings).toEqual(timings)
    expect(result.context).toEqual(context)
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
