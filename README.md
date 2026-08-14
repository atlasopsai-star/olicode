<p align="center">
  <img src="packages/web/src/assets/lander/screenshot.png" alt="OliCode Terminal" width="800" />
</p>

<h1 align="center">OliCode</h1>
<p align="center"><strong>Premium AI Coding Command Center</strong></p>
<p align="center">Multi-model · Terminal-native · Built to ship</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
  <img alt="Built with AI" src="https://img.shields.io/badge/built%20with-AI-gold?style=flat-square" />
</p>

---

OliCode is a premium fork of OpenCode focused on one goal:
turn simple chat prompts into stronger, more efficient, more on-task coding results.

It is being built as a terminal-first AI coding product that helps users save time by giving them:
- smarter task execution
- tighter prompt discipline
- better model routing
- stronger design output
- a more premium command-center workflow

## What OliCode is trying to be

OliCode is not meant to be a generic chatbot in a terminal.
It is meant to be a harnessed coding agent system that:
- works smarter, not harder
- avoids wasted tokens and off-topic wandering
- produces better code and stronger UI/design results
- supports multi-model workflows across Claude, OpenAI/Codex, Gemini, OpenRouter, and local/open models
- evolves into a product that can be marketed and sold as a serious productivity tool

## Current product highlights

- custom OliCode branding and premium dark command-center feel
- gamified OliCode vibe with visual polish and session energy
- one primary coding agent by default, with optional specialists only when useful
- runtime-enforced task contracts for build/debug/design/research/browser/ship tasks
- task-aware model routing
- compact skill and tool routing to reduce prompt bloat
- pre-write and post-diff scope enforcement
- proof-of-done gates before completion claims
- deterministic browser QA and authorization-gated Git/GitHub/Vercel shipping
- live token/cost/session signals in the terminal workflow
- custom project skills for:
  - lean coding discipline
  - premium UI polish
  - browser-use workflows

## How OliCode works

1. User chats with OliCode in the terminal
2. OliCode classifies the task type
3. OliCode routes toward a better-fit model if one is not explicitly pinned
4. OliCode creates a persistent task contract with scope, budgets, and required evidence
5. OliCode exposes only relevant tools and skills, then guards every mutation
6. OliCode checks the actual diff and required proof before allowing completion

## Quick start

```bash
git clone https://github.com/atlasopsai-star/olicode.git
cd olicode
bun install
bun run --filter opencode dev
```

## Running the binary

```bash
# Build first
cd packages/opencode
bun run build

# Run the built binary
./dist/opencode-darwin-arm64/bin/opencode

# Or via npm link
npm link
olicode
```

## Core repository structure

- `packages/opencode/` — core terminal agent, provider logic, tools, session engine, build scripts
- `packages/app/` — application/web-facing pieces used by the product ecosystem
- `packages/ui/` — shared UI/theme system
- `packages/desktop/` — desktop-specific support
- `packages/console/` — console-related app/core packages
- `.opencode/agent/` — custom agent definitions for OliCode
- `.opencode/skills/` — project-specific execution skills
- `docs/PROJECT_OVERVIEW.md` — product and architecture overview

## Agents

OliCode uses one primary implementation agent by default. Optional specialists remain available for tasks where their expected value exceeds their context and tool cost.

Common agents include:
- `build` — primary implementation agent
- `plan` — planning-only mode
- `explore` — codebase exploration
- `scout` — external research/doc lookup when enabled

Project-local custom agents also live in `.opencode/agent/`.

## Configuration

```bash
# project-level config
olicode.json

# project-local opencode/olicode extensions
.opencode/

# global TUI config
~/.config/olicode/tui.json
```

## Development workflow

```bash
# package typecheck
cd packages/opencode && bun typecheck

# repo typecheck
cd /path/to/olicode && bun run typecheck

# targeted tests
cd packages/opencode && bun test

# build release binaries
cd packages/opencode && bun run build
```

## Product direction

Near-term focus:
- make OliCode faster and more on-task
- make coding/design output better than generic AI defaults
- improve browser-task orchestration and execution visibility
- keep tightening model routing and skill selection
- benchmark against OpenCode and other coding-agent tools

## Notes

- OliCode preserves MIT attribution to the upstream OpenCode project
- OliCode is an independent product effort and not affiliated with the OpenCode team
- This repo is an active product codebase, not just a theme/branding experiment

## License

MIT — forked from OpenCode (MIT)
