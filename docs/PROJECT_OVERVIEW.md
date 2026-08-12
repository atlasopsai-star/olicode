# OliCode Project Overview

OliCode is a premium, terminal-native AI coding command center built as an upgraded fork of OpenCode.

Core product goal:
- help builders chat with an agent and get stronger coding results, faster
- reduce off-topic wandering and wasted tokens
- improve design quality beyond generic AI output
- support multi-model workflows across Claude, OpenAI/Codex, Gemini, OpenRouter, and local/open models
- feel like a premium, gamified command center instead of a plain chatbot

What OliCode currently includes:
- custom OliCode branding, theme, home screen, and gamified UI elements
- multi-agent workflow foundation
- mode-aware harness guidance for tighter execution
- task-aware model routing for build/debug/research/design/browser/ship flows
- relevant-skill prioritization to reduce prompt bloat
- task/subagent orchestration with metadata propagation
- session status metadata for routed execution context
- premium design and lean coding discipline skills under `.opencode/skills/`

How it works:
1. User chats with OliCode in the terminal
2. OliCode classifies the task mode
3. OliCode routes toward a better-fit model when the user has not explicitly pinned one
4. OliCode injects focused harness guidance and relevant skills
5. OliCode executes tools/subtasks while preserving richer session metadata
6. OliCode verifies work through tests, typechecks, and builds

Main architecture areas:
- `packages/opencode/src/provider/` — provider/model registry, parsing, routing, SDK loading
- `packages/opencode/src/session/` — harness logic, prompt assembly, session loop, compaction, status, processor
- `packages/opencode/src/tool/` — tool registry, task orchestration, web/file/shell integrations
- `packages/opencode/src/cli/cmd/tui/` — terminal UI and command-center experience
- `.opencode/agent/` — custom agent definitions
- `.opencode/skills/` — project-specific skills and execution doctrine

Near-term product direction:
- continue improving focus, speed, and coding quality
- expose more backend telemetry in the command-center UI
- deepen browser-task orchestration and session visibility
- build benchmark harnesses to prove performance against OpenCode and alternatives

Repository intent:
This repo is the working product source for OliCode, not just an experiment. It is meant to evolve into a commercially viable AI coding tool.
