import path from "path"
import type { MessageV2 } from "./message-v2"
import type { OliTaskContract } from "./harness"

const INPUT_FILEPATH_TOOLS: Record<string, "seen" | "edited"> = { read: "seen", edit: "edited", write: "edited" }
const GENERATED = ["dist/", "build/", "coverage/", ".next/", "node_modules/"]

function filesFromApplyPatchMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return []
  const files = (metadata as Record<string, unknown>).files
  if (!Array.isArray(files)) return []
  return files
    .map((file) => (file && typeof file === "object" ? (file as Record<string, unknown>).filePath : undefined))
    .filter((file): file is string => typeof file === "string" && file.length > 0)
}

export type Classification = "REQUESTED" | "NECESSARY" | "VERIFICATION" | "UNRELATED" | "UNKNOWN"
export type Report = { seen: string[]; edited: string[]; unexamined: string[] }
export type MutationDecision = { classification: Classification; reason: string }

function normalized(filePath: string) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "")
}

function matches(filePath: string, scope: string) {
  const file = normalized(filePath)
  const target = normalized(scope).replace(/\/$/, "")
  if (target === ".") return false
  return file === target || file.endsWith(`/${target}`) || file.startsWith(`${target}/`) || path.basename(file) === target
}

export function classifyFile(filePath: string, contract: OliTaskContract): MutationDecision {
  const file = normalized(filePath)
  if (contract.action === "answer" || contract.action === "inspect" || contract.action === "research")
    return { classification: "UNRELATED", reason: `The ${contract.action} contract does not authorize workspace mutation.` }
  if (contract.protectedScope.some((item) => matches(file, item))) {
    const requested = contract.allowedScope.some((item) => matches(file, item))
    return requested
      ? { classification: "REQUESTED", reason: "The user explicitly named this protected path." }
      : { classification: "UNRELATED", reason: "Protected configuration, environment, or lockfile scope was not requested." }
  }
  if (contract.allowedScope.some((item) => matches(file, item)))
    return { classification: "REQUESTED", reason: "The path is explicitly present in the task contract." }
  if (/\b(test|tests|spec|__tests__)\b/i.test(file))
    return { classification: "VERIFICATION", reason: "The path is a verification companion to the requested change." }
  if (GENERATED.some((item) => file.includes(item)))
    return { classification: "UNRELATED", reason: "Generated output must not be edited as source." }
  if (contract.allowedScope.includes("."))
    return { classification: "UNKNOWN", reason: "No explicit file scope was present; relevance must be justified by inspected context." }
  return { classification: "UNRELATED", reason: "The path is outside the explicit task scope." }
}

export function inspectMutation(input: {
  filePath: string
  exists: boolean
  messages: MessageV2.WithParts[]
  contract: OliTaskContract
}) {
  const decision = classifyFile(input.filePath, input.contract)
  if (decision.classification === "UNRELATED") return decision
  if (!input.exists) {
    if (decision.classification === "UNKNOWN")
      return { classification: "UNRELATED" as const, reason: "A new file requires an explicit path or a task-specific parent scope." }
    return decision
  }
  const report = scan(input.messages)
  if (!report.seen.includes(input.filePath))
    return { classification: "UNRELATED" as const, reason: "Existing files must be read before mutation." }
  return decision
}

export function scan(messages: MessageV2.WithParts[]): Report {
  const seen = new Set<string>()
  const edited = new Set<string>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.state.status !== "completed") continue
      if (part.tool === "apply_patch") {
        for (const file of filesFromApplyPatchMetadata(part.state.metadata)) edited.add(file)
        continue
      }
      const role = INPUT_FILEPATH_TOOLS[part.tool]
      if (!role) continue
      const filePath = part.state.input?.filePath
      if (typeof filePath === "string" && filePath.length > 0) (role === "seen" ? seen : edited).add(filePath)
    }
  }
  const unexamined = [...edited].filter((file) => !seen.has(file))
  return { seen: [...seen].sort(), edited: [...edited].sort(), unexamined: unexamined.sort() }
}

export function postDiff(messages: MessageV2.WithParts[], contract: OliTaskContract) {
  return scan(messages).edited.map((file) => ({ file, ...classifyFile(file, contract) }))
}

export * as ScopeGuard from "./scope-guard"
