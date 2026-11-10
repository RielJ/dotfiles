/**
 * Inputs to a /plan run besides the task: flags, a provided research file,
 * and how they are composed into the planners' task.
 *
 * Pure functions with no sibling imports, so tests can load this file directly.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Research written before the run (e.g. by a research subagent). */
export interface ProvidedContext {
  /** Path as the user gave it, for display. */
  label: string;
  text: string;
  truncated: boolean;
}

export interface PlanInputs {
  /** Give the Phase 0 explorer web_search + web_read. */
  web: boolean;
  provided?: ProvidedContext;
}

/** Large enough for a full research report, small enough for four planner prompts. */
export const MAX_PROVIDED_CONTEXT_CHARS = 40_000;

export interface ParsedPlanArgs {
  wait: boolean;
  web: boolean;
  contextFile?: string;
  task: string;
}

/**
 * Parse `/plan` arguments. Flags may appear anywhere:
 * `--wait`, `--web`, `--context <path>` or `--context=<path>`.
 */
export function parsePlanArgs(args: string): ParsedPlanArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const parsed: ParsedPlanArgs = { wait: false, web: false, task: "" };
  const rest: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--wait") parsed.wait = true;
    else if (token === "--web") parsed.web = true;
    else if (token === "--context") {
      const next = tokens[i + 1];
      if (!next || next.startsWith("--")) throw new Error("--context needs a file path");
      parsed.contextFile = next;
      i++;
    } else if (token.startsWith("--context=")) {
      const value = token.slice("--context=".length);
      if (!value) throw new Error("--context needs a file path");
      parsed.contextFile = value;
    } else rest.push(token);
  }
  parsed.task = rest.join(" ");
  return parsed;
}

/** Read a research file relative to `cwd`. Throws when it is missing or empty. */
export function loadContextFile(cwd: string, file: string, maxChars = MAX_PROVIDED_CONTEXT_CHARS): ProvidedContext {
  const resolved = path.resolve(cwd, file.startsWith("~/") ? path.join(process.env.HOME ?? "~", file.slice(2)) : file);
  let text: string;
  try {
    text = fs.readFileSync(resolved, "utf-8").trim();
  } catch {
    throw new Error(`Context file not found: ${resolved}`);
  }
  if (!text) throw new Error(`Context file is empty: ${resolved}`);
  const truncated = text.length > maxChars;
  return { label: file, text: truncated ? text.slice(0, maxChars) : text, truncated };
}

function providedBlock(provided: ProvidedContext): string {
  const note = provided.truncated ? `\n\n[...truncated to ${MAX_PROVIDED_CONTEXT_CHARS / 1000}K chars; read ${provided.label} for the rest]` : "";
  return `${provided.text}${note}`;
}

/** Pre-context for the Phase 0 explorer: research it should build on, not redo. */
export function explorerPreContext(provided: ProvidedContext | undefined): string | undefined {
  if (!provided) return undefined;
  return `Research provided by the user (from ${provided.label}). Do not repeat it; explore the codebase and fill only the gaps it leaves.\n\n${providedBlock(provided)}`;
}

/**
 * The task every planner receives. Sections, in order: conversation context,
 * provided research, Phase 0 findings, then the task itself.
 */
export function composePlannerTask(parts: {
  task: string;
  provided?: ProvidedContext;
  findings?: string;
  conversation?: string;
}): string {
  const sections: string[] = [];
  if (parts.conversation) {
    sections.push(`## Conversation Context\nThe user has been discussing the following. Use this to inform your plan:\n\n${parts.conversation}`);
  }
  if (parts.provided) {
    sections.push(`## Provided Research (${parts.provided.label})\nTreat this as the current evidence for library and platform choices. Where you disagree, say why.\n\n${providedBlock(parts.provided)}`);
  }
  if (parts.findings) {
    sections.push(`## Codebase Exploration Findings (Phase 0)\n\n${parts.findings}`);
  }
  if (sections.length === 0) return parts.task;
  sections.push(`## Task to Plan\n\n${parts.task}`);
  return sections.join("\n\n");
}
