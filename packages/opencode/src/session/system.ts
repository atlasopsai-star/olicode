import { Context, Effect, Layer } from "effect"

import { InstanceState } from "@/effect/instance-state"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_GPT from "./prompt/gpt.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"

import PROMPT_CODEX from "./prompt/codex.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { SessionHarness } from "./harness"

export function provider(model: Provider.Model) {
  if (model.api.id.includes("gpt")) {
    if (model.api.id.includes("codex")) {
      return [PROMPT_CODEX]
    }
    return [PROMPT_GPT]
  }
  if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI]
  if (model.api.id.includes("claude")) return [PROMPT_ANTHROPIC]
  if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
  if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI]
  return [PROMPT_DEFAULT]
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly harness: (input: { agent: Agent.Info; query: string }) => Effect.Effect<string>
  readonly skills: (input: { agent: Agent.Info; query?: string }) => Effect.Effect<string | undefined>
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3)
}

function scoreSkill(skill: Skill.Info, query?: string) {
  if (!query || !skill.description) return 0
  const haystack = `${skill.name} ${skill.description}`.toLowerCase()
  return tokenize(query).reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0)
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service

    return Service.of({
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        const ctx = yield* InstanceState.context
        return [
          [
            `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
            `Here is some useful information about the environment you are running in:`,
            `<env>`,
            `  Working directory: ${ctx.directory}`,
            `  Workspace root folder: ${ctx.worktree}`,
            `  Is directory a git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`,
            `  Platform: ${process.platform}`,
            `  Today's date: ${new Date().toDateString()}`,
            `</env>`,
          ].join("\n"),
        ]
      }),

      harness: Effect.fn("SystemPrompt.harness")(function* (input: { agent: Agent.Info; query: string }) {
        return SessionHarness.render(input)
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (input: { agent: Agent.Info; query?: string }) {
        if (Permission.disabled(["skill"], input.agent.permission).has("skill")) return

        const list = yield* skill.available(input.agent)
        const described = list.filter((item) => item.description !== undefined)
        if (described.length === 0) return "No skills are currently available."
        if (!SessionHarness.enabled())
          return [
            "Skills provide specialized instructions and workflows for specific tasks.",
            "Use the skill tool to load a skill when a task matches its description.",
            Skill.fmt(described, { verbose: true }),
          ].join("\n")
        if (!input.query) {
          return [
            "Skills provide specialized instructions and workflows for specific tasks.",
            "Use the skill tool to load a skill when a task matches its description.",
            Skill.fmt(described, { verbose: true }),
          ].join("\n")
        }

        if (SessionHarness.rigor(input.query) === "FAST") return

        const scored = described
          .map((item) => ({ item, metadata: Skill.metadata(item), score: scoreSkill(item, input.query) }))
          .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
        const detailed = scored.filter((item) => item.score >= 2).slice(0, 3)

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Load only skills that directly match the current task. Do not load unrelated skills.",
          detailed.length
            ? [
                "<relevant_skills>",
                ...detailed.flatMap(({ item, metadata }) => [
                  "  <skill>",
                  `    <name>${item.name}</name>`,
                  `    <description>${item.description}</description>`,
                  `    <modes>${metadata.modes.join(",")}</modes>`,
                  `    <expected_value>${metadata.expectedValue}</expected_value>`,
                  `    <estimated_cost>${metadata.tokenCost} tokens + ${metadata.toolCost} tool call</estimated_cost>`,
                  "  </skill>",
                ]),
                "</relevant_skills>",
              ].join("\n")
            : "No strongly relevant skills were detected from the current request.",
          "If no candidate fits and specialist knowledge is materially necessary, use the skill tool's query field to search compact metadata.",
        ]
          .filter(Boolean)
          .join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer))

export * as SystemPrompt from "./system"
