import path from "path"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { HarnessCore } from "@/session/harness-core"
import * as Tool from "./tool"
import DESCRIPTION from "./ship.txt"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["preflight", "commit", "push", "pr", "deploy"]),
  files: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "Explicit files to stage (commit)" }),
  message: Schema.optional(Schema.String).annotate({ description: "Conventional commit message (commit)" }),
  title: Schema.optional(Schema.String).annotate({ description: "Conventional PR title (pr)" }),
  body: Schema.optional(Schema.String).annotate({ description: "Pull request body (pr)" }),
  production: Schema.optional(Schema.Boolean).annotate({ description: "Deploy to production instead of preview" }),
})

type Metadata = {
  action: string
  status: "success" | "warning" | "error"
  artifacts: readonly string[]
}

// Recent Vercel CLI versions append a trailing JSON summary when they detect an
// agent environment. That JSON's `deploymentApiUrl` field also matches
// `https://...`, and sorts after the real `deployment.url`, so a naive "last
// https URL in the output" scan silently returns the API endpoint instead of
// the browsable deployment URL. Prefer the structured field when present.
export function extractDeploymentUrl(output: string): string | undefined {
  const jsonStart = output.indexOf("{")
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(output.slice(jsonStart))
      const url = parsed?.deployment?.url
      if (typeof url === "string" && url.length > 0) return url.startsWith("http") ? url : `https://${url}`
    } catch {
      // stdout wasn't (entirely) JSON -- fall through to regex extraction below
    }
  }
  return output.match(/https:\/\/[^\s"'<>]+/g)?.at(-1)
}

export const ShipTool = Tool.define(
  "ship",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          // Vercel (and occasionally git/gh) can leave a subprocess hanging indefinitely --
          // e.g. `vercel deploy` polls forever on a deployment stuck in a BLOCKED readyState
          // (observed live: git-author verification rejects an unrecognized commit author and
          // the CLI never surfaces an error, it just never stops "Building…"). Without a bound,
          // that hangs the whole tool call and the agent turn forever.
          const command = (args: string[], timeoutMs = 60_000) =>
            Effect.tryPromise({
              try: async () => {
                const controller = new AbortController()
                const timer = setTimeout(() => controller.abort(), timeoutMs)
                try {
                  const child = Bun.spawn(args, {
                    cwd: instance.directory,
                    stdout: "pipe",
                    stderr: "pipe",
                    signal: controller.signal,
                  })
                  const [stdout, stderr, exit] = await Promise.all([
                    new Response(child.stdout).text(),
                    new Response(child.stderr).text(),
                    child.exited,
                  ])
                  if (controller.signal.aborted)
                    throw new Error(
                      `${args.slice(0, 2).join(" ")} timed out after ${timeoutMs}ms and was terminated. If this was a Vercel deploy, check the deployment's readyState (it may be BLOCKED -- e.g. an unrecognized git commit author) via the Vercel dashboard.`,
                    )
                  if (exit !== 0)
                    throw new Error(`${args.slice(0, 2).join(" ")} failed (${exit}): ${stderr.trim() || stdout.trim()}`)
                  return stdout.trim()
                } finally {
                  clearTimeout(timer)
                }
              },
              catch: (error) => (error instanceof Error ? error : new Error(String(error))),
            })

          if (params.action !== "preflight" && !HarnessCore.hasCompletedToolAction(ctx.messages, "ship", "preflight"))
            throw new Error("Run ship(preflight) before any shipping mutation.")

          if (params.action === "preflight") {
            const [status, branch, remote, github] = yield* Effect.all([
              command(["git", "status", "--short", "--branch"]),
              command(["git", "branch", "--show-current"]),
              command(["git", "remote", "get-url", "origin"]).pipe(Effect.catch(() => Effect.succeed("(no origin)"))),
              command(["gh", "auth", "status"]).pipe(Effect.catch(() => Effect.succeed("GitHub CLI not authenticated"))),
            ])
            const vercel = yield* Effect.promise(() => Bun.file(path.join(instance.directory, ".vercel/project.json")).exists())
            return {
              title: "ship preflight",
              metadata: { action: "preflight", status: "success" as const, artifacts: [] },
              output: [
                "status: success",
                `summary: branch ${branch || "(detached)"}; origin ${remote}; Vercel ${vercel ? "linked" : "not linked"}`,
                `git:\n${status || "clean"}`,
                `github:\n${github}`,
                "next_actions: run required verification, review scope, then request only the authorized shipping action",
                "artifacts: none",
              ].join("\n"),
            }
          }

          yield* ctx.ask({
            permission: "ship",
            patterns: [params.action, ...(params.production ? ["production"] : [])],
            always: [],
            metadata: { action: params.action, production: params.production },
          })

          if (params.action === "commit") {
            if (!params.files?.length) throw new Error("commit requires explicit files")
            if (!params.message) throw new Error("commit requires a conventional commit message")
            yield* command(["git", "add", "--", ...params.files])
            const result = yield* command(["git", "commit", "-m", params.message])
            return {
              title: "commit created",
              metadata: { action: "commit", status: "success" as const, artifacts: params.files },
              output: `status: success\nsummary: commit created\n${result}\nnext_actions: push only if authorized\nartifacts: ${params.files.join(", ")}`,
            }
          }

          if (params.action === "push") {
            const result = yield* command(["git", "push"])
            return {
              title: "branch pushed",
              metadata: { action: "push", status: "success" as const, artifacts: [] },
              output: `status: success\nsummary: current branch pushed\n${result}\nnext_actions: create a PR only if requested\nartifacts: none`,
            }
          }

          if (params.action === "pr") {
            if (!params.title || !params.body) throw new Error("pr requires title and body")
            const url = yield* command(["gh", "pr", "create", "--title", params.title, "--body", params.body])
            return {
              title: "pull request created",
              metadata: { action: "pr", status: "success" as const, artifacts: [url] },
              output: `status: success\nsummary: pull request created\nnext_actions: inspect checks\nartifacts: ${url}`,
            }
          }

          const args = ["vercel", "deploy", "--yes", ...(params.production ? ["--prod"] : [])]
          const result = yield* command(args, 240_000)
          const url = extractDeploymentUrl(result)
          if (!url) throw new Error(`Vercel completed without returning a deployment URL: ${result}`)
          return {
            title: params.production ? "production deployed" : "preview deployed",
            metadata: { action: "deploy", status: "success" as const, artifacts: [url] },
            output: `status: success\nsummary: ${params.production ? "production" : "preview"} deployment created\nnext_actions: verify this URL with the browser tool\nartifacts: ${url}`,
          }
        }).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
