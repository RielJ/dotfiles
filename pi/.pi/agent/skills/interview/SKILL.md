---
name: interview
description: Interview the user in focused rounds to turn an idea or request into an implementation-ready specification, then save it under the current project's .plans directory. Use when requirements are unclear or the user asks to be interviewed, scoped, or turned into a spec. For adversarial stress-testing of an existing plan, use grilling instead.
metadata:
  source: "23jmo/jmo-skills@6082bf2c472857d6cfda48995ab985b69345aac6"
  license: "MIT, Copyright (c) 2026 Johnathan Mo. See LICENSE."
---

# Interview for a specification

Turn an idea into a specification another engineer can implement without guessing. Ask about decisions. Investigate facts yourself.

## Start with evidence

Before asking questions:

1. Read the user's request and any named files.
2. Inspect the project structure, existing conventions, and relevant implementation when a repository is available.
3. Resolve facts with tools or focused subagents. Do not ask the user where code lives, which package manager the project uses, or anything else the environment can answer.
4. Identify the decisions that remain open.

Do not write code during the interview.

## Build a decision tree

Map the specification as a tree. A decision becomes part of the current frontier only when its prerequisites are settled. Ask the whole current frontier in one round, then use the answers to compute the next frontier.

Cover only branches relevant to the request:

- goal, users, and measurable success;
- current behavior and the problem being solved;
- scope, non-goals, and compatibility requirements;
- user flows, states, data, and permissions;
- failure modes, recovery, observability, and support;
- security, privacy, accessibility, responsive behavior, and internationalization;
- architecture, dependencies, migration, rollout, testing, and acceptance criteria;
- tradeoffs the user must choose rather than facts the repository can establish.

Do not ask obvious questions or repeat settled decisions. Ask about consequences and edge cases that would otherwise become implementation guesses.

## Ask in focused rounds

Use `ask_user_question` for one to four questions per round. Each question must:

- state the decision and why it matters;
- offer two to four distinct choices when the decision has known options;
- put the recommended choice first and label it **Recommended**;
- include a concrete preview only when code, configuration, or layout alternatives need visual comparison;
- allow the user's custom answer through the tool's built-in free-text option.

If a decision cannot fit the structured tool, ask it plainly after the structured round. Do not ask dependent questions in the same round.

Continue until the frontier is empty. If the user intentionally leaves something unresolved, record the assumption or open question instead of inventing an answer.

## Confirm before writing

When the interview is complete, summarize:

- the intended outcome;
- the chosen scope and non-goals;
- the important technical decisions;
- acceptance criteria;
- remaining assumptions or open questions.

Ask the user to confirm or correct that summary. Write the specification only after confirmation, unless the user explicitly asked for a one-pass interview and draft.

## Write the specification

Save the result to an absolute path:

```text
<cwd>/.plans/<topic>-spec.md
```

Use a short kebab-case topic. Create `.plans/` if needed. Keep the specification with the project, never in a global agent configuration directory.

Write normal technical prose with these sections when relevant:

1. Context and problem
2. Goals and non-goals
3. Users and workflows
4. Functional requirements
5. States, data, and interfaces
6. Architecture and implementation constraints
7. Failure handling and observability
8. Security, privacy, and accessibility
9. Migration and rollout
10. Test plan and acceptance criteria
11. Open questions

Make every requirement testable. Separate confirmed decisions, assumptions, and recommendations. Include file or symbol references discovered during repository inspection.

End by reporting the exact path written. Do not implement, commit, or push unless the user asks separately.

## Credit

Adapted from [Johnathan Mo's `interview` skill](https://github.com/23jmo/jmo-skills/tree/6082bf2c472857d6cfda48995ab985b69345aac6/skills/interview). MIT licensed; see [LICENSE](LICENSE).
