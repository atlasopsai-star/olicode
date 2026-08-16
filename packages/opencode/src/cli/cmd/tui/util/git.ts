import { execSync } from "child_process"

function run(cmd: string): string | undefined {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return undefined
  }
}

export function getGitBranch(): string {
  return run("git branch --show-current") || "main"
}

export function getGitStatus(): string {
  const out = run("git status --porcelain")
  if (out === undefined) return ""
  if (!out) return "clean"
  const lines = out.split("\n").filter(Boolean)
  return `${lines.length} changed`
}

export function getLatestCommit(): { hash: string; subject: string } | undefined {
  const out = run("git log -1 --format=%h%x09%s")
  if (!out) return undefined
  const [hash, ...rest] = out.split("\t")
  return { hash, subject: rest.join("\t") }
}

export type DiffStat = { filesChanged: number; linesAdded: number; linesRemoved: number }

export function getDiffStat(): DiffStat {
  const out = run("git diff --shortstat HEAD")
  const stat: DiffStat = { filesChanged: 0, linesAdded: 0, linesRemoved: 0 }
  if (!out) return stat
  const filesMatch = out.match(/(\d+) files? changed/)
  const addedMatch = out.match(/(\d+) insertions?\(\+\)/)
  const removedMatch = out.match(/(\d+) deletions?\(-\)/)
  if (filesMatch) stat.filesChanged = Number(filesMatch[1])
  if (addedMatch) stat.linesAdded = Number(addedMatch[1])
  if (removedMatch) stat.linesRemoved = Number(removedMatch[1])
  return stat
}
