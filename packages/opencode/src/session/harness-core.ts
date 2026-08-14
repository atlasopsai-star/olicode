import type { MessageV2 } from "./message-v2"
import type { OliTaskContract } from "./harness"
import { ScopeGuard, type Classification } from "./scope-guard"

export type Telemetry = {
  modelTurns: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheTokens: number
  toolCalls: number
  repeatedReads: number
  repeatedSearches: number
  filesRead: number
  filesChanged: number
  additions: number
  deletions: number
  failedCommands: number
  retries: number
  selectedSkills: string[]
}

export type Proof = {
  satisfied: string[]
  missing: string[]
  scope: Array<{ file: string; classification: Exclude<Classification, "UNKNOWN">; reason: string }>
  stop: boolean
  telemetry: Telemetry
}

function completedTools(messages: MessageV2.WithParts[]) {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === "tool" && part.state.status === "completed" ? [{ ...part, state: part.state }] : [],
    ),
  )
}

export function telemetry(messages: MessageV2.WithParts[]): Telemetry {
  const tools = completedTools(messages)
  const reads = tools.filter((part) => part.tool === "read").map((part) => String(part.state.input.filePath ?? ""))
  const searches = tools
    .filter((part) => ["grep", "glob", "search"].includes(part.tool))
    .map((part) => JSON.stringify(part.state.input))
  const patches = messages.flatMap((message) => message.parts.filter((part) => part.type === "patch"))
  const steps = messages.flatMap((message) => message.parts.filter((part) => part.type === "step-finish"))
  const edits = ScopeGuard.scan(messages).edited
  const lineChanges = tools.flatMap((part) => {
    const metadata = part.state.metadata
    if (!metadata || typeof metadata !== "object") return []
    if (part.tool === "apply_patch" && Array.isArray(metadata.files)) return metadata.files
    return "filediff" in metadata ? [metadata.filediff] : []
  })
  return {
    modelTurns: steps.length,
    inputTokens: steps.reduce((total, part) => total + part.tokens.input, 0),
    outputTokens: steps.reduce((total, part) => total + part.tokens.output, 0),
    reasoningTokens: steps.reduce((total, part) => total + part.tokens.reasoning, 0),
    cacheTokens: steps.reduce((total, part) => total + part.tokens.cache.read + part.tokens.cache.write, 0),
    toolCalls: tools.length,
    repeatedReads: reads.length - new Set(reads).size,
    repeatedSearches: searches.length - new Set(searches).size,
    filesRead: new Set(reads.filter(Boolean)).size,
    filesChanged: new Set([...edits, ...patches.flatMap((part) => part.files)]).size,
    additions: lineChanges.reduce(
      (total, item) => total + (typeof item?.additions === "number" ? item.additions : 0),
      0,
    ),
    deletions: lineChanges.reduce(
      (total, item) => total + (typeof item?.deletions === "number" ? item.deletions : 0),
      0,
    ),
    failedCommands: tools.filter((part) => part.tool === "shell" && part.state.metadata?.exit !== 0).length,
    retries: messages.flatMap((message) => message.parts).filter((part) => part.type === "retry").length,
    selectedSkills: tools
      .filter((part) => part.tool === "skill")
      .map((part) => String(part.state.metadata?.name ?? "unknown")),
  }
}

export function proof(
  messages: MessageV2.WithParts[],
  contract: OliTaskContract,
  rolledBack: string[] = [],
  workspaceFiles: string[] = [],
): Proof {
  const tools = completedTools(messages)
  const report = ScopeGuard.scan(messages)
  const scope = ScopeGuard.postDiff(messages, contract, workspaceFiles)
    .filter((item) => !rolledBack.includes(item.file))
    .map((item) => ({
      ...item,
      classification: (item.classification === "UNKNOWN"
        ? report.seen.includes(item.file)
          ? "NECESSARY"
          : "UNRELATED"
        : item.classification) as Exclude<Classification, "UNKNOWN">,
    }))
  const successfulShell = tools.filter((part) => part.tool === "shell" && part.state.metadata?.exit === 0)
  const command = successfulShell.map((part) => String(part.state.input.command ?? "")).join("\n")
  const facts = new Set<string>()
  if (
    report.edited.some((file) => !rolledBack.includes(file)) ||
    scope.some((item) => item.classification !== "UNRELATED")
  )
    facts.add("change")
  if (successfulShell.length > 0) facts.add("validation")
  if (
    contract.rigor === "FAST" &&
    tools.some(
      (part, index) =>
        part.tool === "read" &&
        report.edited.includes(String(part.state.input.filePath ?? "")) &&
        tools.slice(0, index).some((candidate) =>
          ["edit", "write", "apply_patch"].includes(candidate.tool),
        ),
    )
  )
    facts.add("validation")
  if (/\b(test|vitest|jest|bun test|pytest|cargo test|go test)\b/i.test(command)) facts.add("tests")
  if (/\b(typecheck|tsc|tsgo)\b/i.test(command)) facts.add("typecheck")
  if (/\b(build|cargo build|go build)\b/i.test(command)) facts.add("build")
  if (!scope.some((item) => item.classification === "UNRELATED")) facts.add("scope")
  const browser = tools.filter((part) => /browser|playwright/i.test(part.tool))
  if (browser.length) facts.add("browser")
  const screenshotWidths = browser.reduce(
    (state, part) => {
      if (part.state.input.action === "viewport" && typeof part.state.input.width === "number")
        return { ...state, width: part.state.input.width }
      if (part.state.input.action !== "screenshot") return state
      return { ...state, screenshots: [...state.screenshots, state.width] }
    },
    { width: 1280, screenshots: [] as number[] },
  ).screenshots
  if (screenshotWidths.some((width) => width >= 1000)) facts.add("wide-screenshot")
  if (screenshotWidths.some((width) => width <= 500)) facts.add("narrow-screenshot")
  if (browser.some((part) => part.state.input.action === "console")) facts.add("console")
  const shipping = tools.filter((part) => part.tool === "ship")
  if (shipping.some((part) => part.state.input.action === "preflight")) facts.add("git")
  if (shipping.some((part) => part.state.input.action === "commit")) facts.add("commit")
  if (shipping.some((part) => part.state.input.action === "push")) facts.add("push")
  if (shipping.some((part) => part.state.input.action === "pr")) facts.add("pr")
  if (shipping.some((part) => part.state.input.action === "deploy")) facts.add("deploy")
  const required = contract.requiredEvidence.map((item) => item.id)
  const missing = required.filter((item) => !facts.has(item))
  const metrics = telemetry(messages)
  return {
    satisfied: required.filter((item) => facts.has(item)),
    missing,
    scope,
    stop: missing.length === 0 && !scope.some((item) => item.classification === "UNRELATED"),
    telemetry: {
      ...metrics,
      filesChanged: new Set([...report.edited, ...workspaceFiles].filter((file) => !rolledBack.includes(file))).size,
    },
  }
}

export function hasCompletedToolAction(messages: MessageV2.WithParts[], tool: string, action: string) {
  return completedTools(messages).some((part) => part.tool === tool && part.state.input.action === action)
}

export function rollbackCandidates(messages: MessageV2.WithParts[], result: Proof) {
  const tools = completedTools(messages)
  return result.scope.flatMap((item) => {
    if (item.classification !== "UNRELATED") return []
    const writes = tools.filter(
      (part) =>
        part.tool === "write" &&
        part.state.input.filePath === item.file &&
        part.state.metadata.exists === false &&
        typeof part.state.input.content === "string",
    )
    if (writes.length !== 1) return []
    const laterMutation = tools.some(
      (part) =>
        part !== writes[0] &&
        ["edit", "write", "apply_patch", "shell"].includes(part.tool) &&
        JSON.stringify(part.state.input).includes(item.file),
    )
    if (laterMutation) return []
    return [{ file: item.file, content: String(writes[0]!.state.input.content) }]
  })
}

export function reminder(result: Proof) {
  return [
    "<olicode_proof_gate>",
    `Missing evidence: ${result.missing.join(", ") || "none"}`,
    `Unrelated changes: ${
      result.scope
        .filter((item) => item.classification === "UNRELATED")
        .map((item) => item.file)
        .join(", ") || "none"
    }`,
    "Perform only the minimum corrective verification or scope resolution. Then finish with a tight outcome/change/verification report.",
    "</olicode_proof_gate>",
  ].join("\n")
}

export function response(text: string, detail: "tight" | "normal" | "detailed" = "tight") {
  const cleaned = text
    .replace(/^\s*(?:sure|certainly|absolutely|of course)[!,.]?\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  const limit = detail === "tight" ? 2_000 : detail === "normal" ? 5_000 : Infinity
  if (cleaned.length <= limit) return cleaned
  return `${cleaned.slice(0, limit).trimEnd()}\n\n[Response shortened by OliHarness]`
}

export * as HarnessCore from "./harness-core"
