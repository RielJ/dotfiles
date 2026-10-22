# Flaky and order-dependent tests

A test that passes alone but fails in the suite, or fails one run in five, still has a cause. Sort it into one of these before touching it.

| What you see | Likely cause | Next step |
|---|---|---|
| Fails every time, even alone | Real bug | Go back to the main skill, then `tdd` |
| Passes alone, fails after certain other tests | Another test leaves state behind | Find the polluter |
| Fails sometimes, even alone | Timing: sleeps, races, real clocks | Replace sleeps with condition waits |
| Fails only in CI | Environment: parallelism, slower machine, missing env vars, timezone, file system case | Compare environments, then the two above |

## Find the polluter

Common leftovers: module-level variables and singletons, `process.env` changes, fake timers left installed, mocks or spies never restored, database rows, temp files, a listening port, a changed working directory.

`scripts/find-polluter.sh` runs each candidate test with your runner and stops at the first one that causes the problem. It has two modes:

```bash
# Which test breaks this one when it runs first?
scripts/find-polluter.sh --run 'bun test {}' --breaks test/target.test.ts 'test/**/*.test.ts'

# Which test leaves this file or directory behind?
scripts/find-polluter.sh --run 'npx vitest run {}' --creates .git 'src/**/*.test.ts'
```

`{}` in `--run` is replaced with the test file. Use `--breaks` for order-dependent failures and `--creates` for stray files. It exits 1 and prints `POLLUTER: <file>` when it finds one, 0 when every candidate is clean, and 2 on bad usage or when the target already fails alone.

`--breaks` runs each candidate and the target in one process, candidate first. Pass the same isolation and parallelism flags the failing suite uses (`vitest --no-file-parallelism`, `jest --runInBand`); a runner that isolates each file won't reproduce in-process leaks. Candidates that fail on their own are skipped, not reported.

When you find it, fix the polluter's cleanup (restore the mock, reset the singleton, use a temp directory). Don't add a reset to the victim; that hides the leak from every other test.

## Replace sleeps with condition waits

A fixed delay guesses how long something takes. It passes on a fast laptop and fails on a loaded CI machine. Wait for the thing you need instead:

```ts
async function waitFor<T>(
  condition: () => T | undefined | null | false,
  description: string,
  timeoutMs = 5000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = condition();
    if (value) return value;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

// Before: await new Promise((r) => setTimeout(r, 50)); expect(getResult()).toBeDefined();
await waitFor(() => getResult(), "result");
```

- Read fresh state inside the condition. Capturing it before the loop makes the wait meaningless.
- Always set a timeout, and say in the error what it was waiting for.
- Poll around every 10ms. Polling every 1ms burns CPU without helping.
- Use the test framework's own helper if it has one (Testing Library `waitFor`, Playwright auto-waiting `expect`).

A fixed delay is correct only when the behavior under test is itself timed, like a debounce or a 100ms tick. Then wait for the triggering condition first, base the delay on the known interval, and write a comment saying why.

## Prove the fix

One green run proves nothing for a flaky test. Rerun the exact failing combination many times:

```bash
for i in $(seq 20); do bun test test/polluter.test.ts test/target.test.ts >/dev/null 2>&1 || echo "fail $i"; done
```

No output means 20 of 20 passed. Report the count. For a timing failure, also run it under load (the full suite in parallel, or with CPU throttled) if that's where it failed before.
