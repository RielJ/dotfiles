export const SUBAGENT_REPORT_RULES = `## Final report
Lead with the result. Keep every fact the orchestrator needs to verify or act on: changed files, file:line references, commands with pass or fail results, decisive output lines, failures, and anything you could not verify.
Cut narration of your steps, restated task text, filler, and pleasantries. Use short complete sentences or lists. Do not compress evidence into fragments or drop details to save words.`;

export function buildSubagentTaskMessage(options: {
  task: string;
  role?: string | null;
  modeHint?: string;
  skillBlock?: string;
  context?: string;
  summaryInstruction?: string;
  inheritsConversationContext: boolean;
}): string {
  const skillBlock = options.skillBlock?.trim();
  const context = options.context?.trim();
  const parts = [
    skillBlock
      ? `## Skills selected by orchestrator\nFollow these skill instructions for this task.\n\n${skillBlock}`
      : "",
    options.task,
    context ? `## Curated context from orchestrator\n${context}` : "",
  ];

  if (!options.inheritsConversationContext) {
    parts.unshift(options.role ?? "", options.modeHint ?? "");
    parts.push(options.summaryInstruction ?? "");
  }
  parts.push(SUBAGENT_REPORT_RULES);

  return parts.filter((part) => part.trim()).join("\n\n");
}
