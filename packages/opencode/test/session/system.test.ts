import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import type { Agent } from "../../src/agent/agent"
import { NamedError } from "@opencode-ai/core/util/error"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import { SystemPrompt } from "../../src/session/system"
import { testEffect } from "../lib/effect"

const skills: Skill.Info[] = [
  {
    name: "zeta-skill",
    description: "Zeta skill.",
    location: "/tmp/zeta-skill/SKILL.md",
    content: "# zeta-skill",
  },
  {
    name: "alpha-skill",
    description: "Alpha skill.",
    location: "/tmp/alpha-skill/SKILL.md",
    content: "# alpha-skill",
  },
  {
    name: "middle-skill",
    description: "Middle skill.",
    location: "/tmp/middle-skill/SKILL.md",
    content: "# middle-skill",
  },
  {
    name: "manual-skill",
    location: "/tmp/manual-skill/SKILL.md",
    content: "# manual-skill",
  },
  {
    name: "design-polish",
    description: "Improve UI design, landing pages, spacing, typography, and premium visual polish.",
    location: "/tmp/design-polish/SKILL.md",
    content: "# design-polish",
  },
  {
    name: "browser-automation",
    description: "Use browser automation for web testing, DOM inspection, and navigation flows.",
    location: "/tmp/browser-automation/SKILL.md",
    content: "# browser-automation",
  },
]

const build: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

const it = testEffect(
  SystemPrompt.layer.pipe(
    Layer.provide(
      Layer.succeed(
        Skill.Service,
        Skill.Service.of({
          get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
          require: (name) => {
            const info = skills.find((skill) => skill.name === name)
            if (info) return Effect.succeed(info)
            return Effect.fail(new Skill.NotFoundError({ name, available: skills.map((skill) => skill.name) }))
          },
          all: () => Effect.succeed(skills),
          dirs: () => Effect.succeed([]),
          available: () => Effect.succeed(skills),
        }),
      ),
    ),
  ),
)

describe("session.system", () => {
  it.effect("skills output is sorted by name and stable across calls", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const first = yield* prompt.skills({ agent: build })
      const second = yield* prompt.skills({ agent: build })
      const output = first ?? (yield* Effect.fail(new NamedError.Unknown({ message: "missing skills output" })))

      expect(first).toBe(second)

      const alpha = output.indexOf("<name>alpha-skill</name>")
      const middle = output.indexOf("<name>middle-skill</name>")
      const zeta = output.indexOf("<name>zeta-skill</name>")

      expect(alpha).toBeGreaterThan(-1)
      expect(middle).toBeGreaterThan(alpha)
      expect(zeta).toBeGreaterThan(middle)
      expect(output).not.toContain("manual-skill")
    }),
  )

  it.effect("skills output prioritizes relevant skills for the current task", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.skills({
        agent: build,
        query: "Redesign the landing page UI with premium typography and more visual polish",
      })

      expect(output).toContain("<name>design-polish</name>")
      expect(output).toContain("Other available skills by name:")
      expect(output).toContain("browser-automation")
    }),
  )
})
