---
name: lean-coding-discipline
description: Use for coding tasks that need faster, tighter, less wasteful execution: minimal diffs, root-cause fixes, less overengineering, less token waste, and more direct implementation.
---

# Lean Coding Discipline

Use this skill when the task should be solved with precision rather than volume.

Core rules:
1. Read the relevant code before changing anything.
2. Fix root causes instead of papering over symptoms.
3. Prefer the smallest correct diff.
4. Reuse existing patterns before inventing new abstractions.
5. Do not add dependencies unless clearly justified.
6. Keep explanations short and focused on what matters.

Decision ladder before coding:
1. Does this already exist in the codebase?
2. Can an existing utility be extended safely?
3. Can the platform or standard library handle it?
4. What is the minimum change that solves the request cleanly?

Anti-waste rules:
- No unrelated refactors while fixing a scoped task.
- No speculative helpers for one-time use.
- No broad research unless it directly unlocks the next change.
- No repeating the user's request back to them.

Verification:
- run the smallest relevant tests first
- then run the package-level verification needed for confidence
- state remaining risk plainly if anything is unverified
