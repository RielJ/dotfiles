/**
 * A session is "tainted" once it has read outside content (web pages, fetched
 * URLs, MCP fetches). Memory written by the agent after that goes to inbox/,
 * because outside content can carry injected instructions.
 */
const TAINTING_TOOLS = /^(web_search|web_read|browser_\w+|agent_browser\w*|fetch\w*|mcp)$/;
const TAINTING_BASH = /\b(curl|wget|http(ie)?|xh)\b|\bgh\s+api\b|\bgh\s+(issue|pr)\s+view\b/;

export function taints(toolName: string, input: unknown): string | null {
	if (TAINTING_TOOLS.test(toolName)) return toolName;
	if (toolName === "bash") {
		const command = (input as { command?: unknown } | undefined)?.command;
		if (typeof command === "string") {
			const match = command.match(TAINTING_BASH);
			if (match) return `bash: ${match[0]}`;
		}
	}
	return null;
}

export class TaintTracker {
	reason: string | null = null;

	observe(toolName: string, input: unknown): void {
		if (this.reason) return;
		this.reason = taints(toolName, input);
	}

	get tainted(): boolean {
		return this.reason !== null;
	}

	reset(): void {
		this.reason = null;
	}
}
