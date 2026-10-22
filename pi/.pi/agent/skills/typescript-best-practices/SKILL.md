---
name: typescript-best-practices
description: Apply TypeScript type and boundary rules (discriminated unions, branded types, constructive modeling, unknown over any, schemas before guards, no as casts, exhaustive switches, satisfies, schema-derived types, object args). Use when writing, editing, or reviewing TypeScript, .ts or .tsx files, type definitions, or type guards. Skip for plain JavaScript with no types.
metadata:
  source: "cursor_plugins/pstack/skills/typescript-best-practices (Lauren Tan, pstack)"
  license: "MIT, Copyright (c) 2026 Lauren Tan. See LICENSE."
---

# TypeScript best practices

Read `principles` (`references/type-system-discipline.md`) first. This skill grounds it in TypeScript syntax.

| Rule | Summary |
|------|---------|
| Discriminated unions | Model variants with a `kind` literal discriminant so impossible states can't be represented. No optional-field bags. |
| Branded types | Brand primitives with `& { readonly __brand: "X" }` so they can't be mixed up. Validate once at the boundary. |
| Constructive modeling | Build the shape so the illegal value can't be constructed. `[T, ...T[]]` for non-empty, `[T, T][]` for even length, `start` plus `duration` for a range. Not a runtime guard, not a wish for refinement types. |
| Simplest total type | Keep `T[]` while every operation on it stays total. Strengthen to `NonEmpty<T>` only where the loose type forces `!`, a cast, or a "should never happen" throw. |
| `unknown` over `any` | External data is `unknown`. |
| Schemas before guards | Before you hand-write a property-by-property type guard, use the repo's runtime schema library and infer the type from the schema, such as `z.infer`. |
| No `as` casts | Every `as` is a runtime crash waiting to happen. Cast only after validation. |
| Narrowing hierarchy | Discriminant switch > `in` operator > `typeof`/`instanceof` > user-defined type guard > `as`. |
| Type guards | A guard must verify its claim. A lying guard is worse than `as` because the bug hides behind a name that says it's safe. Name them `isX` or `hasX`. |
| Exhaustiveness | Put `const _exhaustive: never = x;` in default arms so the compiler errors when a new variant is added. |
| `satisfies` over `as` | Validates the value without widening literal types. |
| Boundary validation | Parse where data crosses in, into a named domain type. `Record<string, unknown>` (however spelled) stops at that parse. Trust types inside. See `principles` (`references/boundary-discipline.md`). |
| Schema-derived types | Reach for `Pick`/`Omit`/`Parameters`/`ReturnType`/`Awaited`/`typeof` before declaring a new interface. |
| Object args | Pass objects, not positional arguments, so argument order documents itself. Skip on hot paths (per-frame render, tokenizers, parsers). |
| Real tests | Don't mock what you can run. Prefer the framework's real test primitives with leak and disposable checks, and verify UI in a running build. Mock only what you can't run locally. |
| Structured telemetry | Prefer structured logger diagnostics with enough context to debug from an id. No `console.log` in shipped code. |

Code examples for every rule: `references/patterns.md`.

**Reply:** when reviewing, list each violation with its `file:line`, the rule it breaks, and the fix. When writing, name any rule you chose to break and why.
