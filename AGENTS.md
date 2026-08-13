- To regenerate the JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- The default branch in this repo is `main`.

## Commits and PR Titles

Use conventional commit-style messages and PR titles: `type(scope): summary`.

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. Scopes are optional; use the affected package or area when helpful, e.g. `core`, `opencode`, `tui`, `app`, `desktop`, `sdk`, or `plugin`.

Examples: `fix(tui): simplify thinking toggle styling`, `docs: update contributing guide`, `chore(sdk): regenerate types`.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name that improves the caller.
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream
- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from "./agent"`) when adding a new config module.

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Complex Logic

When a function has several validation branches or supporting details, make the main function read as the happy path and move supporting details into small helpers below it.

```ts
// Good
export function loadThing(input: unknown) {
  const config = requireConfig(input)
  const metadata = readMetadata(input)
  return createThing({ config, metadata })
}

function requireConfig(input: unknown) {
  ...
}
```

- Keep helpers close to the code they support, below the main export when that improves readability.
- Do not over-abstract simple expressions into many single-use helpers; extract only when it names a real concept like `requireConfig` or `readMetadata`.
- Do not return `Effect` from helpers unless they actually perform effectful work. Synchronous parsing, validation, and option building should stay synchronous.
- Prefer Effect schema helpers such as `Schema.UnknownFromJsonString` and `Schema.decodeUnknownOption` over manual `JSON.parse` wrapped in `Effect.try` when parsing untrusted JSON strings.
- Add comments for non-obvious constraints and surprising behavior, not for obvious assignments or control flow.

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.

---

## OliCode Product Guidelines

This is **OliCode** — a forked, rebranded, and upgraded version of OpenCode.
Repository: https://github.com/atlasopsai-star/olicode | Branch: olicode-upgrade

### What OliCode Is

OliCode is the world's most visually exciting and technically capable AI coding terminal.
It should feel better than Claude Code, Codex CLI, and plain OpenCode.
Target experience: premium command center, not a basic chatbot.

### Build Commands

```bash
# Type check all packages (from repo root)
bun run typecheck

# Build binary
cd packages/opencode && bun run build

# Run OliCode
./packages/opencode/dist/opencode-darwin-arm64/bin/opencode
```

### ABSOLUTE RULES

1. **Do NOT break** working OpenCode/OliCode functionality
2. **Do NOT fake data** — no hardcoded fake token counts, fake model names, fake git status
3. **Do NOT remove** Session 2–6 branding and visual improvements
4. **Always run typecheck** after TypeScript changes (`bun run typecheck` from repo root)
5. **Preserve** OpenCode license attribution (MIT)
6. **Build small, test often** — commit safe milestones

### Key Completed Features (DO NOT BREAK)

- Animated OLICODE logo with shimmer effect (logo.tsx + cli/logo.ts)
- Live clock and status bar on home screen (routes/home.tsx)
- Left sidebar: Command Center, Project Overview, Gamification (routes/session/left-sidebar.tsx)
- Session stats header: model, tokens, timer (routes/session/index.tsx)
- Activity feed: recent file changes (feature-plugins/sidebar/activity.tsx)
- OliCode dark gold theme (context/theme/olicode.json)
- Gamification: XP/level/streak persisted to ~/.olicode/gamification.json (context/gamification.tsx)

### OliCode Branding Rules

- All user-facing text: "OliCode" (not "OpenCode" or "opencode")
- Binary: `olicode`
- GitHub: `atlasopsai-star/olicode`
- Theme: deep navy + gold primary + cyan/purple/magenta accents

### Quality Standards for OliCode

When building UI or features:
- Every panel must use real backend data or show an honest empty/loading state
- Never fake session stats, token counts, git info, or file counts
- Design for "premium command center" feel — not generic coding tool
- Anti-slop check: would this impress someone paying for a product? If no, improve it.
- Test in narrow terminal (80 cols) AND wide terminal (200+ cols)

### OliCode Coding Harness

When the user asks you to build something:
1. **Understand** — read the relevant code first, never assume
2. **Plan** — break into numbered steps, use TodoWrite
3. **Design** — ask: what does premium look like here? avoid generic patterns
4. **Build** — match existing code style exactly
5. **Verify** — run typecheck + build before reporting done
6. **Ship** — leave no half-finished work, every change must compile
