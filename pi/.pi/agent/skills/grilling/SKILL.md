---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the frontier, give your recommended answer to each question, and wait for the user's answers before the next round.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them through `ask_user_question` and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

## Ask with `ask_user_question`

Ask every question through the `ask_user_question` tool. Never write questions as plain text in your reply and wait for a typed answer.

The tool has hard limits. Build each call within them:

- One call holds 1 to 4 questions. If the frontier has more than 4, ask the 4 highest-impact questions first, then ask the rest in the next call before computing a new frontier.
- Each question needs 2 to 4 mutually exclusive options. When a question has no natural options, offer the most plausible candidate answers. The tool always adds a free-text row, so the user can still give any answer.
- Put your recommended answer first and end its label with `(Recommended)`. Use its `description` to give your reasoning in one or two sentences.
- Keep `header` to 16 characters or fewer and each option `label` to 60 characters or fewer. Put the detail in `question` and `description`.
- Use `multiSelect: true` only when more than one answer can be true at once.
- Use `preview` only to compare concrete artifacts such as code, configuration, or layout sketches.

Before the call, you may write one or two sentences of context, such as what the last answers settled. Do not repeat the questions in that text.

If the user dismisses the questionnaire, stop and ask whether to continue. Do not treat a dismissal as an answer.
