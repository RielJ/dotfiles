---
name: click-path-audit
description: Trace a button, toggle, or form submit through every state write its handler makes, in order, to find calls that each work but undo each other, race, or leave the screen in a state the label doesn't promise. Use when a control "does nothing" with no error, ends in the wrong state, or after changing a shared store (Zustand, Redux, React context) and you need to check its callers. Skip for worst-case data (break-ui), styling and accessibility (design), and the downstream impact of a diff (blast-radius).
metadata:
  source: "affaan-m/ECC skills/click-path-audit"
  license: "MIT, Copyright (c) 2026 Affaan Mustafa. See LICENSE."
---

# Click-path audit

Some UI bugs survive every ordinary check. The button has a handler, every function it calls exists, nothing throws, and the types line up. It still does nothing, because a later call quietly resets what an earlier call set.

The bug that prompted this skill was a "New Email" button:

```ts
onClick={() => {
  store.setComposeMode(true); // composeMode = true
  store.selectThread(null);   // also sets composeMode = false
}}
```

`selectThread` cleared `composeMode` as a side effect. Each call was correct on its own; together they did nothing. You only see it if you know what every store action resets.

## Pick the scope first

This audit is slow, so agree on the scope before starting. If the user didn't say, ask.

- **One control.** A user reports that a specific button is broken.
- **One page.** You just built or refactored a screen.
- **One store.** You changed a store action. Audit every caller of the actions you changed.
- **Whole app.** Before a launch or after a large state refactor. Build the store map yourself first, then spawn one `explore` subagent per page with the `subagent` tool, and pass each one the map as context.

## 1. Map what each store action writes

For every store, context, or reducer in scope, list each action and the fields it sets. Then list the fields it resets that belong to some other action. Those resets cause most of these bugs.

```text
STORE: emailStore
  setComposeMode(on)   sets {composeMode}
  selectThread(t)      sets {selectedThread, messages, drafts}
                       RESETS {composeMode: false, composeData: null}

RESETS STATE IT DOESN'T OWN:
  selectThread clears composeMode (owned by setComposeMode)
```

Find actions with `ffgrep` (`set(`, `dispatch(`, `create(`, `createSlice`) and their callers with `lsp_navigation` references or `ast_grep_search`. Include reducers and `useEffect`s that react to a field, since they write state too.

## 2. Trace each control

For each control in scope, walk the handler call by call, in source order, and note what each call reads and writes. Then follow anything that runs afterwards: promise callbacks, effects that watch the fields you wrote, and re-renders that change props.

```text
CONTROL: "New Email" in ThreadList.tsx:142
  1. setComposeMode(true)   sets composeMode = true
  2. selectThread(null)     RESETS composeMode = false   <- undoes call 1
  EXPECTED: the compose pane opens
  FINAL STATE: composeMode = false, so nothing opens
  VERDICT: bug (sequential undo)
```

The question for every control is whether the final state matches what its label promises. Ask it about the final state, not just whether each step ran.

## Bug patterns

1. **Sequential undo.** A later call resets a field an earlier call set, as in the example above.
2. **Async race.** Two requests both write `loading` or the same record. Whichever resolves last wins, so the result depends on timing.
3. **Stale closure.** The handler captured an old value: `setCount(count + 1)` twice adds 1, not 2. A `useCallback` dependency list that's missing a field causes the same thing.
4. **Missing transition.** The label says Save, Delete, or Send, but the handler only validates, sets a flag, or calls an endpoint that no longer exists.
5. **Dead branch.** The real work sits behind a condition that is always false at that moment, such as a field the previous line just cleared.
6. **Effect interference.** The handler sets a field and a `useEffect` watching it sets it straight back, or navigates away.

## 3. Prove it

A trace on paper is a hypothesis. Before calling a control broken or fine, exercise it and read the final state:

- a component or store test that fires the handler and asserts the final state (use the `tdd` skill for the regression test), or
- a short script that calls the store actions in the handler's order, or
- the running app via `agent_browser`: click the control, then check the DOM or the store.

Say for each verdict which of these you did. "Traced only" is allowed, but label it.

## Report

One entry per bug, worst first:

```text
CLICK-PATH-001  high
  Control:  "New Email" in src/ThreadList.tsx:142
  Pattern:  sequential undo
  Trace:    setComposeMode(true) sets composeMode; selectThread(null) resets it
  Expected: compose pane opens
  Actual:   nothing happens (store test: composeMode === false after click)
  Fix:      call selectThread(null) first, or stop selectThread resetting composeMode
```

Then list the controls you traced and found clean, so the user knows what was covered.
