/** Refuse to store anything that looks like a credential. */
const PATTERNS: [string, RegExp][] = [
	["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
	["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{16,}/],
	["OpenAI-style key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
	["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{20,}/],
	["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
	["Google API key", /\bAIza[0-9A-Za-z_-]{30,}/],
	["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
	["Stripe key", /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/],
	["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
	["npm token", /\bnpm_[A-Za-z0-9]{30,}/],
	["assigned secret", /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"'`]{8,}/i],
];

/** Name of the first credential pattern found, or null. */
export function findSecret(text: string): string | null {
	for (const [name, re] of PATTERNS) if (re.test(text)) return name;
	return null;
}
