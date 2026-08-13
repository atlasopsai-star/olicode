import type { MessageV2 } from "./message-v2"

// read/edit/write all take an absolute `filePath` input param — read straight
// from the recorded tool input rather than output metadata, which varies
// per tool and isn't meant for this purpose (e.g. read's metadata.loaded is
// auto-attached AGENTS.md files, not the file that was read).
const INPUT_FILEPATH_TOOLS: Record<string, "seen" | "edited"> = {
  read: "seen",
  edit: "edited",
  write: "edited",
}

// apply_patch takes a raw patch string as input (no structured path), so the
// changed files have to come from its output metadata instead.
function filesFromApplyPatchMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return []
  const files = (metadata as Record<string, unknown>).files
  if (!Array.isArray(files)) return []
  return files
    .map((file) => (file && typeof file === "object" ? (file as Record<string, unknown>).filePath : undefined))
    .filter((f): f is string => typeof f === "string" && f.length > 0)
}

export type Report = {
  seen: string[]
  edited: string[]
  unexamined: string[]
}

/**
 * Scans the conversation's completed tool calls to find files that were
 * edited without ever being read first — a proxy for "acted without
 * understanding context" rather than a guess about topical relevance.
 */
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

export * as ScopeGuard from "./scope-guard"
