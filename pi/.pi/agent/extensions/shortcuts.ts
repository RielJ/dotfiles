/**
 * Shortcuts — /shortcuts
 *
 * Displays all keyboard shortcuts in one place:
 * - Built-in keybindings (from pi's defaults + keybindings.json overrides)
 * - Extension shortcuts (discovered from installed extensions)
 * - Vim mode bindings (if pi-vim is active)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ── Built-in defaults (from pi keybindings.md) ──────────────────────────
const BUILTIN_SHORTCUTS: Record<string, { keys: string[]; description: string; category: string }> = {
	// Cursor Movement
	"tui.editor.cursorUp":        { keys: ["up"],                          description: "Move cursor up",            category: "Cursor Movement" },
	"tui.editor.cursorDown":      { keys: ["down"],                        description: "Move cursor down",          category: "Cursor Movement" },
	"tui.editor.cursorLeft":      { keys: ["left", "ctrl+b"],              description: "Move cursor left",          category: "Cursor Movement" },
	"tui.editor.cursorRight":     { keys: ["right", "ctrl+f"],             description: "Move cursor right",         category: "Cursor Movement" },
	"tui.editor.cursorWordLeft":  { keys: ["alt+left", "ctrl+left", "alt+b"], description: "Move cursor word left",  category: "Cursor Movement" },
	"tui.editor.cursorWordRight": { keys: ["alt+right", "ctrl+right", "alt+f"], description: "Move cursor word right", category: "Cursor Movement" },
	"tui.editor.cursorLineStart": { keys: ["home", "ctrl+a"],              description: "Move to line start",        category: "Cursor Movement" },
	"tui.editor.cursorLineEnd":   { keys: ["end", "ctrl+e"],               description: "Move to line end",          category: "Cursor Movement" },
	"tui.editor.jumpForward":     { keys: ["ctrl+]"],                      description: "Jump forward to character", category: "Cursor Movement" },
	"tui.editor.jumpBackward":    { keys: ["ctrl+alt+]"],                  description: "Jump backward to character", category: "Cursor Movement" },
	"tui.editor.pageUp":          { keys: ["pageUp"],                      description: "Scroll up by page",         category: "Cursor Movement" },
	"tui.editor.pageDown":        { keys: ["pageDown"],                    description: "Scroll down by page",       category: "Cursor Movement" },

	// Deletion
	"tui.editor.deleteCharBackward":  { keys: ["backspace"],               description: "Delete char backward",      category: "Deletion" },
	"tui.editor.deleteCharForward":   { keys: ["delete", "ctrl+d"],        description: "Delete char forward",       category: "Deletion" },
	"tui.editor.deleteWordBackward":  { keys: ["ctrl+w", "alt+backspace"], description: "Delete word backward",      category: "Deletion" },
	"tui.editor.deleteWordForward":   { keys: ["alt+d", "alt+delete"],     description: "Delete word forward",       category: "Deletion" },
	"tui.editor.deleteToLineStart":   { keys: ["ctrl+u"],                  description: "Delete to line start",      category: "Deletion" },
	"tui.editor.deleteToLineEnd":     { keys: ["ctrl+k"],                  description: "Delete to line end",        category: "Deletion" },

	// Input
	"tui.input.newLine": { keys: ["shift+enter"],  description: "Insert new line", category: "Input" },
	"tui.input.submit":  { keys: ["enter"],         description: "Submit input",    category: "Input" },
	"tui.input.tab":     { keys: ["tab"],            description: "Tab / autocomplete", category: "Input" },

	// Kill Ring & Undo
	"tui.editor.yank":    { keys: ["ctrl+y"],  description: "Paste recently deleted text", category: "Kill Ring" },
	"tui.editor.yankPop": { keys: ["alt+y"],   description: "Cycle through deleted text",  category: "Kill Ring" },
	"tui.editor.undo":    { keys: ["ctrl+-"],  description: "Undo last edit",               category: "Kill Ring" },

	// Clipboard & Selection
	"tui.input.copy":     { keys: ["ctrl+c"],   description: "Copy selection",     category: "Clipboard" },
	"tui.select.up":      { keys: ["up"],        description: "Move selection up",  category: "Clipboard" },
	"tui.select.down":    { keys: ["down"],      description: "Move selection down", category: "Clipboard" },
	"tui.select.confirm": { keys: ["enter"],     description: "Confirm selection",  category: "Clipboard" },
	"tui.select.cancel":  { keys: ["escape", "ctrl+c"], description: "Cancel selection", category: "Clipboard" },

	// Application
	"app.interrupt":          { keys: ["escape"],  description: "Cancel / abort",              category: "Application" },
	"app.clear":              { keys: ["ctrl+c"],  description: "Clear editor",                category: "Application" },
	"app.exit":               { keys: ["ctrl+d"],  description: "Exit (when editor empty)",    category: "Application" },
	"app.suspend":            { keys: ["ctrl+z"],  description: "Suspend to background",       category: "Application" },
	"app.editor.external":    { keys: ["ctrl+g"],  description: "Open in external editor",     category: "Application" },
	"app.clipboard.pasteImage": { keys: ["ctrl+v"], description: "Paste image from clipboard", category: "Application" },

	// Sessions
	"app.session.togglePath":        { keys: ["ctrl+p"], description: "Toggle path display",    category: "Sessions" },
	"app.session.toggleSort":        { keys: ["ctrl+s"], description: "Toggle sort mode",        category: "Sessions" },
	"app.session.toggleNamedFilter": { keys: ["ctrl+n"], description: "Toggle named-only filter", category: "Sessions" },
	"app.session.rename":            { keys: ["ctrl+r"], description: "Rename session",          category: "Sessions" },
	"app.session.delete":            { keys: ["ctrl+d"], description: "Delete session",          category: "Sessions" },

	// Models & Thinking
	"app.model.select":        { keys: ["ctrl+l"],        description: "Open model selector",     category: "Models" },
	"app.model.cycleForward":  { keys: ["ctrl+p"],        description: "Cycle to next model",     category: "Models" },
	"app.model.cycleBackward": { keys: ["shift+ctrl+p"],  description: "Cycle to previous model", category: "Models" },
	"app.thinking.cycle":      { keys: ["shift+tab"],     description: "Cycle thinking level",    category: "Models" },
	"app.thinking.toggle":     { keys: ["ctrl+t"],        description: "Collapse/expand thinking", category: "Models" },

	// Display & Messages
	"app.tools.expand":      { keys: ["ctrl+o"],     description: "Collapse/expand tool output", category: "Display" },
	"app.message.followUp":  { keys: ["alt+enter"],  description: "Queue follow-up message",     category: "Display" },
	"app.message.dequeue":   { keys: ["alt+up"],     description: "Restore queued messages",     category: "Display" },

	// Tree Navigation
	"app.tree.foldOrUp":             { keys: ["ctrl+left", "alt+left"],  description: "Fold branch / jump prev", category: "Tree Nav" },
	"app.tree.unfoldOrDown":         { keys: ["ctrl+right", "alt+right"], description: "Unfold branch / jump next", category: "Tree Nav" },
	"app.tree.editLabel":            { keys: ["shift+l"],                description: "Edit label on node",       category: "Tree Nav" },
	"app.tree.toggleLabelTimestamp":  { keys: ["shift+t"],               description: "Toggle label timestamps",  category: "Tree Nav" },
	"app.tree.filter.default":       { keys: ["ctrl+d"],                 description: "Default tree filter",      category: "Tree Nav" },
	"app.tree.filter.noTools":       { keys: ["ctrl+t"],                 description: "Hide tool results",        category: "Tree Nav" },
	"app.tree.filter.userOnly":      { keys: ["ctrl+u"],                 description: "Show user messages only",  category: "Tree Nav" },
	"app.tree.filter.all":           { keys: ["ctrl+a"],                 description: "Show all entries",         category: "Tree Nav" },
	"app.tree.filter.cycleForward":  { keys: ["ctrl+o"],                 description: "Cycle filter forward",     category: "Tree Nav" },

	// Scoped Models Selector
	"app.models.save":           { keys: ["ctrl+s"],   description: "Save model selection",       category: "Model Selector" },
	"app.models.enableAll":      { keys: ["ctrl+a"],   description: "Enable all models",          category: "Model Selector" },
	"app.models.clearAll":       { keys: ["ctrl+x"],   description: "Clear all models",           category: "Model Selector" },
	"app.models.toggleProvider": { keys: ["ctrl+p"],   description: "Toggle provider models",     category: "Model Selector" },
	"app.models.reorderUp":      { keys: ["alt+up"],   description: "Move model up",              category: "Model Selector" },
	"app.models.reorderDown":    { keys: ["alt+down"], description: "Move model down",            category: "Model Selector" },
};

// ── Known extension shortcuts ────────────────────────────────────────────
const EXTENSION_SHORTCUTS: { key: string; description: string; source: string }[] = [
	{ key: "ctrl+shift+f",  description: "Search past sessions",          source: "pi-session-search" },
	{ key: "ctrl+shift+r",  description: "Dual code review",              source: "superpowers/reviewer" },
	{ key: "ctrl+alt+h",    description: "Stash history",                  source: "pi-powerline-footer" },
	{ key: "ctrl+alt+c",    description: "Copy editor contents",           source: "pi-powerline-footer" },
	{ key: "ctrl+alt+x",    description: "Cut editor contents",            source: "pi-powerline-footer" },
];

// ── Vim mode bindings (shown when pi-vim is likely active) ───────────────
const VIM_SHORTCUTS: { key: string; description: string; mode: string }[] = [
	// Normal mode
	{ key: "escape / ctrl+[", description: "Enter normal mode",           mode: "insert → normal" },
	{ key: "i",               description: "Enter insert mode",           mode: "normal → insert" },
	{ key: "a",               description: "Append after cursor",         mode: "normal → insert" },
	{ key: "A",               description: "Append at end of line",       mode: "normal → insert" },
	{ key: "I",               description: "Insert at start of line",     mode: "normal → insert" },
	{ key: "o",               description: "Open line below",             mode: "normal → insert" },
	{ key: "O",               description: "Open line above",             mode: "normal → insert" },
	{ key: "h / ←",           description: "Move left",                   mode: "normal" },
	{ key: "l / →",           description: "Move right",                  mode: "normal" },
	{ key: "j / ↓",           description: "Move down",                   mode: "normal" },
	{ key: "k / ↑",           description: "Move up",                     mode: "normal" },
	{ key: "w",               description: "Word forward",                mode: "normal" },
	{ key: "b",               description: "Word backward",               mode: "normal" },
	{ key: "e",               description: "End of word",                  mode: "normal" },
	{ key: "0",               description: "Start of line",               mode: "normal" },
	{ key: "$",               description: "End of line",                  mode: "normal" },
	{ key: "x",               description: "Delete char under cursor",    mode: "normal" },
	{ key: "dd",              description: "Delete entire line",           mode: "normal" },
	{ key: "dw",              description: "Delete word",                  mode: "normal" },
	{ key: "d$",              description: "Delete to end of line",        mode: "normal" },
	{ key: "d0",              description: "Delete to start of line",      mode: "normal" },
	{ key: "cc",              description: "Change entire line",           mode: "normal" },
	{ key: "cw",              description: "Change word",                  mode: "normal" },
	{ key: "u",               description: "Undo",                        mode: "normal" },
	{ key: "ctrl+r",          description: "Redo",                        mode: "normal" },
	{ key: "p",               description: "Paste after cursor",          mode: "normal" },
	{ key: "P",               description: "Paste before cursor",         mode: "normal" },
	{ key: "yy",              description: "Yank (copy) line",            mode: "normal" },
	{ key: "yw",              description: "Yank word",                   mode: "normal" },
	{ key: "alt+o",           description: "Toggle fold for tool output", mode: "normal" },
];

function loadKeybindingsOverrides(): Record<string, string[]> {
	const keybindingsPath = join(process.env.HOME || "~", ".pi", "agent", "keybindings.json");
	try {
		if (existsSync(keybindingsPath)) {
			const raw = JSON.parse(readFileSync(keybindingsPath, "utf-8"));
			const result: Record<string, string[]> = {};
			for (const [id, val] of Object.entries(raw)) {
				result[id] = Array.isArray(val) ? val : [val as string];
			}
			return result;
		}
	} catch { /* ignore */ }
	return {};
}

function hasVimExtension(): boolean {
	try {
		const settingsPath = join(process.env.HOME || "~", ".pi", "agent", "settings.json");
		if (existsSync(settingsPath)) {
			const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			const pkgs: string[] = settings.packages || [];
			return pkgs.some(p => p.includes("pi-vim"));
		}
	} catch { /* ignore */ }
	return false;
}

function formatKeys(keys: string[]): string {
	return keys.map(k => `\`${k}\``).join(", ");
}

function buildShortcutsOutput(): string {
	const overrides = loadKeybindingsOverrides();
	const vimActive = hasVimExtension();

	const lines: string[] = [];
	lines.push("# ⌨️  All Keyboard Shortcuts\n");

	// ── Built-in (with overrides applied) ────────────────────────
	lines.push("## Built-in Keybindings\n");
	lines.push("*Custom overrides from `keybindings.json` shown with* ✏️\n");

	const categories = new Map<string, { id: string; keys: string[]; description: string; overridden: boolean }[]>();

	for (const [id, info] of Object.entries(BUILTIN_SHORTCUTS)) {
		const isOverridden = id in overrides;
		const keys = isOverridden ? overrides[id] : info.keys;

		if (!categories.has(info.category)) {
			categories.set(info.category, []);
		}
		categories.get(info.category)!.push({
			id,
			keys,
			description: info.description,
			overridden: isOverridden,
		});
	}

	for (const [category, bindings] of categories) {
		lines.push(`### ${category}\n`);
		lines.push("| Keys | Description | Action |");
		lines.push("|------|-------------|--------|");
		for (const b of bindings) {
			const mark = b.overridden ? " ✏️" : "";
			lines.push(`| ${formatKeys(b.keys)}${mark} | ${b.description} | \`${b.id}\` |`);
		}
		lines.push("");
	}

	// ── Extension shortcuts ──────────────────────────────────────
	if (EXTENSION_SHORTCUTS.length > 0) {
		lines.push("## Extension Shortcuts\n");
		lines.push("| Keys | Description | Source |");
		lines.push("|------|-------------|--------|");
		for (const s of EXTENSION_SHORTCUTS) {
			lines.push(`| \`${s.key}\` | ${s.description} | ${s.source} |`);
		}
		lines.push("");
	}

	// ── Vim mode ─────────────────────────────────────────────────
	if (vimActive) {
		lines.push("## Vim Mode (pi-vim)\n");
		lines.push("| Keys | Description | Mode |");
		lines.push("|------|-------------|------|");
		for (const v of VIM_SHORTCUTS) {
			lines.push(`| \`${v.key}\` | ${v.description} | ${v.mode} |`);
		}
		lines.push("");
	}

	// ── Tips ─────────────────────────────────────────────────────
	lines.push("## Configuration\n");
	lines.push("Edit `~/.pi/agent/keybindings.json` to customize bindings.");
	lines.push("Run `/reload` after editing to apply changes.\n");
	lines.push("```json");
	lines.push('{ "tui.editor.cursorUp": ["up", "ctrl+p"] }');
	lines.push("```");

	return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("shortcuts", {
		description: "Show all keyboard shortcuts (built-in, extensions, vim)",
		handler: async (_args, ctx) => {
			const output = buildShortcutsOutput();
			pi.sendMessage(
				{
					customType: "shortcuts-display",
					content: output,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});
}
