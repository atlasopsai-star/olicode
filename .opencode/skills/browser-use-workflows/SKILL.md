---
name: browser-use-workflows
description: Use when a task requires browser automation, DOM interaction, navigation flows, screenshots, form submission, login journeys, or validating a live website/app end-to-end. Inspired by browser-use style workflows.
---

# Browser Use Workflows

Use this skill when the task is better solved in a real browser than with static web fetches.

Principles:
1. Start with the smallest reproducible browser path.
2. Navigate with purpose — do not wander across unrelated pages.
3. Prefer task-oriented checkpoints: page loaded, element found, form submitted, state verified.
4. Record only high-signal observations.
5. When blocked, explain the blocker precisely and try one focused fallback.

Workflow:
1. Restate the browser objective in one sentence.
2. Identify the minimum page/action sequence.
3. Execute the sequence.
4. Capture concrete evidence: page state, visible text, resulting URL, validation message, screenshot or DOM clue.
5. Return a short result with outcome, evidence, and next action.

Rules:
- Do not keep browsing after the required evidence is collected.
- Do not summarize the whole site when only one flow matters.
- When testing UX, note friction points, broken states, and visual issues concisely.
- When debugging, isolate the exact failing step before proposing fixes.
