# Root cause tracing

A failure deep in the call stack (a `git init` in the wrong directory, a file written to the wrong place, a database opened with the wrong path) tempts you to patch the line that failed. That line is usually innocent. Trace back to where the bad value came from and fix it there.

## Steps

1. **State the symptom exactly.** For example: `git init` ran in `packages/core`, the source directory.
2. **Find the line that did it.** `execFile('git', ['init'], { cwd: projectDir })`.
3. **Ask what called it, and with what.** Walk up one caller at a time and write down the value at each level:
   ```text
   WorktreeManager.create(projectDir = "")
     <- Session.initializeWorkspace()
     <- Session.create()
     <- test calls Project.create("name", context.tempDir)
   ```
4. **Keep going until the value is first wrong.** Here an empty `cwd` falls back to `process.cwd()`, and `context.tempDir` was read at module load, before `beforeEach` filled it in.
5. **Fix it there.** Make `tempDir` a getter that throws if read before setup. A check in `WorktreeManager` alone would only hide the bug.

Once the source is fixed, a check at an earlier layer is worth adding when a bad value there would be expensive, like writing into the source tree. Treat it as extra protection on top of the source fix, never instead of it.

## When you can't trace by reading

Log right before the risky operation, not after it fails:

```ts
console.error("DEBUG git init", {
  directory,
  cwd: process.cwd(),
  env: process.env.NODE_ENV,
  stack: new Error().stack,
});
```

- Use `console.error` in tests. Test runners and loggers often swallow `console.log` or logger output.
- Include the inputs, the working directory, the relevant environment, and the stack.
- Run the suite and filter the output: `bun test 2>&1 | rg "DEBUG git init"`.
- In the stack traces, look for the test file and line that start the chain, and for what the failing calls have in common.

If something appears during the test run and you don't know which test made it, use `scripts/find-polluter.sh` (see `flaky-tests.md`).
