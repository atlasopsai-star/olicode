// Blind A/B design judge for OliBench design tasks.
//
// Takes the wide/narrow screenshots bench-harness-core.ts already captures
// for a "stock" vs "olicode" trial pair, randomly relabels them A/B (the
// mapping is never shown to the judge model), and asks a fixed rubric to
// score each side and pick a winner. Reports the true winner only after
// scoring, so nothing about which is which can bias the judge's response.
//
// Usage:
//   OLI_BENCH_MODEL=openai/gpt-5.4-mini bun run script/design-judge.ts \
//     --task premium-local-service \
//     --stock-wide /path/stock-wide.png --stock-narrow /path/stock-narrow.png \
//     --olicode-wide /path/olicode-wide.png --olicode-narrow /path/olicode-narrow.png

import path from "node:path"

const model = process.env.OLI_BENCH_MODEL
if (!model) throw new Error("Set OLI_BENCH_MODEL to the exact judge model.")

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1 || !process.argv[index + 1]) throw new Error(`Missing --${name}`)
  return process.argv[index + 1]!
}

const task = arg("task")
const stockWide = arg("stock-wide")
const stockNarrow = arg("stock-narrow")
const olicodeWide = arg("olicode-wide")
const olicodeNarrow = arg("olicode-narrow")

const RUBRIC = [
  "product specificity",
  "visual hierarchy",
  "typography",
  "composition",
  "spacing/rhythm",
  "color coherence",
  "responsive behavior",
  "interaction polish",
  "accessibility",
  "DesignContract adherence (does it look like a considered product, not a template)",
  "generic-AI-pattern penalty (purple/blue gradient hero, plain 3-card grid, boilerplate copy -- penalize these)",
]

// Randomly assign which real variant is "A" and which is "B" so the judge
// prompt itself carries no hint. The mapping is only read back after scoring.
const swap = Math.random() < 0.5
const labels = {
  A: swap ? { variant: "olicode", wide: olicodeWide, narrow: olicodeNarrow } : { variant: "stock", wide: stockWide, narrow: stockNarrow },
  B: swap ? { variant: "stock", wide: stockWide, narrow: stockNarrow } : { variant: "olicode", wide: olicodeWide, narrow: olicodeNarrow },
}

const prompt = `You are a blind design judge. You will see four screenshots of two competing implementations of the same task, labeled A and B. Each has a wide (desktop) and narrow (mobile) screenshot. Score each of A and B from 0-10 on every criterion below, then give a one-sentence rationale and a final verdict.

Criteria:
${RUBRIC.map((item, index) => `${index + 1}. ${item}`).join("\n")}

Do not guess which system (a specific AI tool or vendor) produced which -- judge only what you see on screen. Output your final answer as a fenced json block with this exact shape, and nothing after it:

\`\`\`json
{
  "scores": {
    "A": { "productSpecificity": 0, "visualHierarchy": 0, "typography": 0, "composition": 0, "spacingRhythm": 0, "colorCoherence": 0, "responsiveBehavior": 0, "interactionPolish": 0, "accessibility": 0, "designContractAdherence": 0, "genericAiPenalty": 0 },
    "B": { "productSpecificity": 0, "visualHierarchy": 0, "typography": 0, "composition": 0, "spacingRhythm": 0, "colorCoherence": 0, "responsiveBehavior": 0, "interactionPolish": 0, "accessibility": 0, "designContractAdherence": 0, "genericAiPenalty": 0 }
  },
  "winner": "A" | "B" | "tie",
  "rationale": "one sentence"
}
\`\`\`

Images, in order: A (wide), A (narrow), B (wide), B (narrow).`

const args = [
  "run",
  prompt,
  "--format",
  "json",
  "--model",
  model,
  "-f",
  labels.A.wide,
  "-f",
  labels.A.narrow,
  "-f",
  labels.B.wide,
  "-f",
  labels.B.narrow,
]

const child = Bun.spawn(["bun", "run", "--conditions=browser", "src/index.ts", ...args], {
  cwd: path.resolve(import.meta.dir, ".."),
  stdout: "pipe",
  stderr: "pipe",
})
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
])

if (exitCode !== 0) {
  console.error(`design-judge run failed (${exitCode}): ${stderr.slice(-2000)}`)
  process.exit(1)
}

// --format json emits one JSON event per line; the judge's fenced ```json
// block is inside the final assistant text part.
const events = stdout
  .split("\n")
  .filter(Boolean)
  .flatMap((line) => {
    try {
      return [JSON.parse(line) as Record<string, unknown>]
    } catch {
      return []
    }
  })
const texts: string[] = []
const visit = (value: unknown) => {
  if (!value || typeof value !== "object") return
  if (Array.isArray(value)) return value.forEach(visit)
  const item = value as Record<string, unknown>
  if (item.type === "text" && typeof item.text === "string") texts.push(item.text)
  Object.values(item).forEach(visit)
}
events.forEach(visit)

const combined = texts.join("\n")
const match = combined.match(/```json\s*([\s\S]*?)```/)
if (!match) {
  console.error("judge did not return a parseable verdict. Raw text:\n", combined.slice(-2000))
  process.exit(1)
}
const verdict = JSON.parse(match[1]!) as { scores: Record<"A" | "B", Record<string, number>>; winner: "A" | "B" | "tie"; rationale: string }

const trueWinner = verdict.winner === "tie" ? "tie" : labels[verdict.winner].variant
console.log(
  JSON.stringify(
    {
      task,
      labelMapping: { A: labels.A.variant, B: labels.B.variant },
      scores: verdict.scores,
      blindWinner: verdict.winner,
      trueWinner,
      rationale: verdict.rationale,
    },
    null,
    2,
  ),
)
