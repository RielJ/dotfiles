import { writeFileSync } from "node:fs";
import type {
  AssistantMessage,
  ToolResultMessage,
  UserMessage,
} from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Commitment } from "./score.ts";

/**
 * A deterministic, tool-heavy synthetic session with planted commitments.
 * About 85% of its tokens are tool output, like a real coding session.
 * Every planted key occurs exactly once; filler never repeats them.
 */

const ZERO_USAGE: AssistantMessage["usage"] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

let clock = Date.UTC(2026, 0, 1);
const tick = () => (clock += 1000);

function user(text: string): UserMessage {
  return { role: "user", content: text, timestamp: tick() };
}
function assistant(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "anthropic",
    model: "synthetic",
    usage: ZERO_USAGE,
    stopReason,
    timestamp: tick(),
  };
}
function toolResult(id: string, text: string): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: id,
    toolName: "read",
    content: [{ type: "text", text }],
    isError: false,
    timestamp: tick(),
  };
}

/** Pseudo-source for a file read: deterministic, never contains planted keys. */
function fileBody(round: number, lines: number): string {
  const out: string[] = [];
  for (let i = 0; i < lines; i++)
    out.push(
      `export function step${round}_${i}(input: number): number { return input * ${(round * 31 + i) % 97} + ${i}; }`,
    );
  return out.join("\n");
}

export interface PlantedSession {
  file: string;
  commitments: Commitment[];
  /** Entry id of the last user message; useful as a probe point. */
  lastUserEntryId: string;
}

/** The planted turns. Rounds not listed here get a filler user message and reply. */
const PLANTS: { round: number; user: string; reply?: string }[] = [
  {
    round: 1,
    user: [
      "Next, wire up the exporter.",
      "",
      "Two rules for the rest of this work:",
      "- Don't touch the migrations folder, except to add new files under migrations/pending.",
      "- Keep the public API of src/export.ts unchanged until v3 ships.",
    ].join("\n"),
  },
  {
    round: 2,
    user: "Never use default exports in this repo, because the bundler config relies on named exports.",
  },
  {
    round: 3,
    user: "How should we lay out the providers?",
    reply:
      "Option A: one file per provider. Option B: keep all providers in src/providers.ts.",
  },
  { round: 4, user: "Go with B, and keep it under 400 lines." },
  {
    round: 5,
    user: `${"Quick status check on the exporter work so far, and a few notes on what I saw in the logs this morning while the nightly job ran against staging, mostly noise about retries and a slow DNS lookup that we can ignore for now. ".repeat(2)}Also, from now on run the integration tests with --runInBand, since the shared fixture database breaks under parallel workers.`,
  },
  // Mid-session: past pi-vcc's "Early Session Requests" and long before its last-15 window.
  {
    round: 40,
    user: "From here on, put every new helper in src/util/, not next to its caller.",
  },
];

export const PLANTED_COMMITMENTS: Commitment[] = [
  {
    id: "migrations",
    kind: "constraint",
    keys: [
      "Don't touch the migrations folder",
      "except to add new files under migrations/pending",
    ],
  },
  {
    id: "export-api",
    kind: "constraint",
    keys: ["Keep the public API of src/export.ts unchanged", "until v3 ships"],
  },
  {
    id: "no-default-exports",
    kind: "constraint",
    keys: [
      "Never use default exports in this repo",
      "because the bundler config relies on named exports",
    ],
  },
  {
    id: "providers-layout",
    kind: "decision",
    keys: [
      "Option B: keep all providers in src/providers.ts",
      "Go with B, and keep it under 400 lines",
    ],
  },
  {
    id: "run-in-band",
    kind: "constraint",
    keys: [
      "run the integration tests with --runInBand",
      "the shared fixture database breaks under parallel workers",
    ],
  },
  {
    id: "helpers-in-util",
    kind: "constraint",
    keys: ["put every new helper in src/util/", "not next to its caller"],
  },
];

export function generateSyntheticSession(
  file: string,
  rounds = 120,
  linesPerRead = 120,
): PlantedSession {
  clock = Date.UTC(2026, 0, 1);
  const sm = SessionManager.inMemory("/tmp/synthetic-project");
  let lastUserEntryId = "";
  for (let r = 0; r < rounds; r++) {
    const plant = PLANTS.find((p) => p.round === r);
    lastUserEntryId = sm.appendMessage(
      user(
        plant?.user ??
          `Round ${r}: look at module ${r} and tell me what step${r} computes.`,
      ),
    );
    const callId = `call_${r}`;
    sm.appendMessage(
      assistant(
        [
          {
            type: "toolCall",
            id: callId,
            name: "read",
            arguments: { path: `src/module${r}.ts` },
          },
        ],
        "toolUse",
      ),
    );
    sm.appendMessage(toolResult(callId, fileBody(r, linesPerRead)));
    sm.appendMessage(
      assistant(
        [
          {
            type: "text",
            text:
              plant?.reply ??
              `Module ${r} scales its input by a fixed factor per step.`,
          },
        ],
        "stop",
      ),
    );
  }
  const header = sm.getHeader();
  const lines = [
    JSON.stringify(header),
    ...sm.getEntries().map((e) => JSON.stringify(e)),
  ];
  writeFileSync(file, `${lines.join("\n")}\n`);
  return { file, commitments: PLANTED_COMMITMENTS, lastUserEntryId };
}
