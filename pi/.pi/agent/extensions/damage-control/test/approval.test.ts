import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLOW_OPTION, BLOCK_OPTION, type ConfirmUI, gate } from "../approval.ts";
import type { Decision } from "../policy.ts";

type Call = { message: string; options: string[]; timeout?: number; signal?: AbortSignal };

/** answer: true picks "Allow once", false picks "Block", undefined is Escape or timeout. */
function fakeUI(answer: (call: Call) => Promise<boolean | undefined>): ConfirmUI & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async select(message, options, opts) {
      const call = { message, options, timeout: opts?.timeout, signal: opts?.signal };
      calls.push(call);
      const a = await answer(call);
      return a === undefined ? undefined : a ? ALLOW_OPTION : BLOCK_OPTION;
    },
  };
}

const ask: Decision = { action: "ask", reasons: ["Recursive delete (rm -r) outside temp folders: src"] };
const base = { hasUI: true, summary: "bash: rm -rf src" };

describe("gate", () => {
  test("allow never prompts", async () => {
    const ui = fakeUI(async () => true);
    assert.equal(await gate({ action: "allow" }, { ...base, ui }), undefined);
    assert.equal(ui.calls.length, 0);
  });

  test("hard block never prompts and says never allowed", async () => {
    const ui = fakeUI(async () => true);
    const r = await gate({ action: "block", reasons: ["git push --force is forbidden"] }, { ...base, ui });
    assert.equal(ui.calls.length, 0);
    assert.match(r?.reason ?? "", /never allowed[\s\S]*push --force[\s\S]*Do not retry/);
  });

  test("approved ask runs the call", async () => {
    const ui = fakeUI(async () => true);
    assert.equal(await gate(ask, { ...base, ui }), undefined);
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.calls[0].timeout, 120_000, "default timeout is 2 minutes");
    assert.match(ui.calls[0].message, /rm -rf src[\s\S]*outside temp folders[\s\S]*120s/);
    assert.deepEqual(ui.calls[0].options, [BLOCK_OPTION, ALLOW_OPTION], "Block is first, so it has focus");
  });

  test("Escape or timeout (undefined) blocks", async () => {
    const ui = fakeUI(async () => undefined);
    assert.equal((await gate(ask, { ...base, ui }))?.block, true);
  });

  test("declined or timed-out ask blocks with the reason", async () => {
    const ui = fakeUI(async () => false);
    const r = await gate(ask, { ...base, ui, timeoutMs: 5 });
    assert.equal(r?.block, true);
    assert.match(r?.reason ?? "", /did not answer within 0 seconds|did not answer within 5/);
    assert.match(r?.reason ?? "", /outside temp folders/);
  });

  test("a real timeout: dialog that waits for its own timer", async () => {
    const ui = fakeUI((c) => new Promise((res) => setTimeout(() => res(undefined), c.timeout)));
    const started = Date.now();
    const r = await gate(ask, { ...base, ui, timeoutMs: 30 });
    assert.equal(r?.block, true);
    assert.ok(Date.now() - started >= 25);
  });

  test("no UI (print mode) blocks without prompting", async () => {
    const ui = fakeUI(async () => true);
    const r = await gate(ask, { ...base, hasUI: false, ui });
    assert.equal(ui.calls.length, 0);
    assert.match(r?.reason ?? "", /no UI/);
  });

  test("already-aborted turn blocks without prompting", async () => {
    const ui = fakeUI(async () => true);
    const r = await gate(ask, { ...base, ui, signal: AbortSignal.abort() });
    assert.equal(ui.calls.length, 0);
    assert.equal(r?.block, true);
  });

  test("a throwing dialog blocks instead of allowing", async () => {
    const ui = fakeUI(async () => {
      throw new Error("tui gone");
    });
    assert.equal((await gate(ask, { ...base, ui }))?.block, true);
  });

  test("parallel asks show one dialog at a time", async () => {
    let open = 0;
    let maxOpen = 0;
    const ui = fakeUI(async () => {
      open++;
      maxOpen = Math.max(maxOpen, open);
      await new Promise((r) => setTimeout(r, 10));
      open--;
      return true;
    });
    await Promise.all([gate(ask, { ...base, ui }), gate(ask, { ...base, ui }), gate(ask, { ...base, ui })]);
    assert.equal(ui.calls.length, 3);
    assert.equal(maxOpen, 1);
  });
});
