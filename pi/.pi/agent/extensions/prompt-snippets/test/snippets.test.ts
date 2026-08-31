// @ts-nocheck -- registration test uses a minimal structural ExtensionAPI mock.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import promptSnippets, { __test__ } from "../index.ts";

const { parseSnippet, loadSnippets, composeMessage } = __test__;

describe("snippet parsing", () => {
  it("reads frontmatter and defaults a missing placement to append", () => {
    const snippet = parseSnippet(
      "tight.md",
      "---\nname: Tight diffs\ndescription: Smallest change\norder: 50\n---\nNo drive-by refactors.\n",
    );
    assert.deepEqual(snippet, {
      id: "tight.md",
      name: "Tight diffs",
      description: "Smallest change",
      placement: "append",
      order: 50,
      body: "No drive-by refactors.",
    });
  });

  it("rejects files without frontmatter or without a body", () => {
    assert.equal(parseSnippet("x.md", "no frontmatter here"), null);
    assert.equal(parseSnippet("x.md", "---\nname: Empty\n---\n\n"), null);
  });

  it("loads the bundled snippets with prepends before appends", () => {
    const snippets = loadSnippets();
    const ids = snippets.map((s) => s.id);
    assert.ok(ids.includes("orchestrator-mode.md"));
    assert.ok(ids.includes("delegate-exploration.md"));

    const lastPrepend = snippets.map((s) => s.placement).lastIndexOf("prepend");
    const firstAppend = snippets.map((s) => s.placement).indexOf("append");
    assert.ok(
      lastPrepend < firstAppend,
      "prepend group must sort ahead of the append group",
    );

    for (const group of ["prepend", "append"]) {
      const orders = snippets
        .filter((s) => s.placement === group)
        .map((s) => s.order);
      assert.deepEqual(
        orders,
        [...orders].sort((a, b) => a - b),
        `${group} group must sort by order`,
      );
    }
  });
});

describe("message composition", () => {
  it("wraps the typed text in order", () => {
    const active = [
      {
        id: "a",
        name: "A",
        description: "",
        placement: "prepend",
        order: 1,
        body: "BEFORE",
      },
      {
        id: "b",
        name: "B",
        description: "",
        placement: "append",
        order: 1,
        body: "AFTER",
      },
    ];
    assert.equal(composeMessage(active, "typed"), "BEFORE\n\ntyped\n\nAFTER");
    assert.equal(composeMessage([], "typed"), "typed");
  });
});

describe("registration and send behaviour", () => {
  it("registers alt+s, /snippets, and leaves untoggled messages untouched", async () => {
    const handlers: Record<string, Function> = {};
    const shortcuts: string[] = [];
    const commands: string[] = [];
    const api = {
      on: (event: string, fn: Function) => {
        handlers[event] = fn;
      },
      registerShortcut: (key: string) => shortcuts.push(key),
      registerCommand: (name: string) => commands.push(name),
    };
    promptSnippets(api);

    assert.deepEqual(shortcuts, ["alt+s"]);
    assert.deepEqual(commands, ["snippets"]);

    let widget: unknown = "unset";
    const ctx = {
      hasUI: true,
      mode: "tui",
      ui: {
        setWidget: (_id: string, lines: unknown) => {
          widget = lines;
        },
        theme: { fg: (_c: string, s: string) => s, bold: (s: string) => s },
        notify: () => {},
      },
    };

    await handlers.session_start({}, ctx);
    assert.equal(widget, undefined, "no snippets toggled at session start");
    // Nothing toggled → the input event passes through untransformed.
    assert.equal(await handlers.input({ text: "hello" }, ctx), undefined);
  });
});
