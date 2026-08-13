import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { ScopeGuard } from "@/session/scope-guard"
import DESCRIPTION from "./scope_check.txt"
import type { Execution } from "@/session/harness"

export const Parameters = Schema.Struct({})

type Metadata = {
  seen: string[]
  edited: string[]
  unexamined: string[]
  diff: Array<{ file: string; classification: string; reason: string }>
  unrelated: string[]
}

export const ScopeCheckTool = Tool.define<typeof Parameters, Metadata, never>(
  "scope_check",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (_params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "scope_check",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          const report = ScopeGuard.scan(ctx.messages)
          const execution = ctx.extra?.execution as Execution | undefined
          const diff = execution ? ScopeGuard.postDiff(ctx.messages, execution.contract) : []
          const unrelated = diff.filter((item) => item.classification === "UNRELATED")

          return {
            title:
              report.unexamined.length + unrelated.length > 0
                ? `${report.unexamined.length + unrelated.length} scope issue(s)`
                : "scope clean",
            metadata: { ...report, diff, unrelated: unrelated.map((item) => item.file) },
            output: [
              report.edited.length ? `Edited files:\n${report.edited.map((f) => `- ${f}`).join("\n")}` : "No files edited yet.",
              report.unexamined.length
                ? `\nEdited without reading first (verify these are intentional):\n${report.unexamined.map((f) => `- ${f}`).join("\n")}`
                : "\nEvery edited file was read first.",
              diff.length
                ? `\nPost-diff classifications:\n${diff.map((item) => `- ${item.classification}: ${item.file} — ${item.reason}`).join("\n")}`
                : "",
            ].join("\n"),
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
