/**
 * Superpowers for Pi — Auto-Discovering Master Controller
 *
 * HOW TO ADD A NEW MODULE:
 *   Native (full runtime toggle):
 *     1. Create a .ts file in this directory
 *     2. Export `module` with { id, name, description, systemPromptWhenEnabled }
 *     3. Export `init(pi, isEnabled)` function
 *     4. Done — /extensions shows it with live toggle
 *
 *   Legacy (any standard Pi extension):
 *     1. Drop a .ts file into a subdirectory (e.g. community/)
 *     2. It auto-registers with runtime toggle via proxy wrapper
 *     3. themeMap.ts and other non-extension helpers are auto-skipped
 *
 * Use /extensions (or /superpowers) to toggle modules on/off interactively.
 * Settings persist to ~/.pi/agent/settings.json under "superpowers" key.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { matchesKey, Key, truncateToWidth } from "@mariozechner/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ────────────────────────────────────────────────────────────

interface ModuleMeta {
	id: string;
	name: string;
	description: string;
	group?: string;
	systemPromptWhenEnabled?: string;
}

interface DiscoveredModule {
	meta: ModuleMeta;
	type: "native" | "legacy";
	initNative?: (pi: ExtensionAPI, isEnabled: () => boolean) => void;
	initLegacy?: (pi: ExtensionAPI) => void;
	file: string;
}

interface SuperpowersSettings {
	enabled: Record<string, boolean>;
}

// ── Settings ─────────────────────────────────────────────────────────

const SETTINGS_KEY = "superpowers";

function getSettingsPath(): string {
	return path.join(process.env.HOME || "~", ".pi", "agent", "settings.json");
}

function loadSettings(): SuperpowersSettings {
	try {
		const p = getSettingsPath();
		if (fs.existsSync(p)) {
			const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
			if (raw[SETTINGS_KEY]) return raw[SETTINGS_KEY];
		}
	} catch {}
	return { enabled: {} };
}

function saveSettings(settings: SuperpowersSettings): void {
	try {
		const p = getSettingsPath();
		let raw: Record<string, any> = {};
		if (fs.existsSync(p)) raw = JSON.parse(fs.readFileSync(p, "utf-8"));
		raw[SETTINGS_KEY] = settings;
		fs.mkdirSync(path.dirname(p), { recursive: true });
		fs.writeFileSync(p, JSON.stringify(raw, null, 2) + "\n", "utf-8");
	} catch {}
}

// ── Humanize module ID ───────────────────────────────────────────────

function humanize(filename: string): string {
	return filename
		.replace(/\.ts$/, "")
		.split(/[-_]/)
		.map(w => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

// ── Extract description from file header comment ─────────────────────

function extractDescription(filePath: string): string {
	try {
		const head = fs.readFileSync(filePath, "utf-8").slice(0, 1000);
		// Match " * Name — Description" pattern
		const dashMatch = head.match(/^\s*\*\s+.+?—\s+(.+)/m);
		if (dashMatch) return dashMatch[1].trim();
		// Fallback: first non-empty line after opening /**
		const lines = head.split("\n");
		for (const line of lines) {
			const cleaned = line.replace(/^[\s/*]+/, "").trim();
			if (cleaned && !cleaned.startsWith("@") && !cleaned.startsWith("Usage")) return cleaned;
		}
	} catch {}
	return "Pi extension";
}

// ── Auto-Discovery ───────────────────────────────────────────────────

const SKIP_FILES = new Set(["index.ts", "themeMap.ts"]);

function isExtensionFile(filePath: string): boolean {
	const base = path.basename(filePath);
	if (!base.endsWith(".ts")) return false;
	if (SKIP_FILES.has(base)) return false;
	// Skip files that start with _ (helpers/utilities)
	if (base.startsWith("_")) return false;
	return true;
}

function discoverModules(extensionDir: string): DiscoveredModule[] {
	const modules: DiscoveredModule[] = [];

	function scanDir(dir: string, group?: string) {
		let entries: string[];
		try { entries = fs.readdirSync(dir); } catch { return; }

		for (const entry of entries) {
			const fullPath = path.join(dir, entry);
			const stat = fs.statSync(fullPath);

			if (stat.isDirectory() && entry !== "node_modules" && !entry.startsWith(".")) {
				scanDir(fullPath, entry);
				continue;
			}

			if (!stat.isFile() || !isExtensionFile(fullPath)) continue;

			try {
				const mod = require(fullPath);

				if (mod.module && typeof mod.init === "function") {
					// ── Native module (module + init) ────────────
					const meta = mod.module as ModuleMeta;
					if (!meta.id || !meta.name) continue;
					if (group) meta.group = group;
					modules.push({ meta, type: "native", initNative: mod.init, file: entry });

				} else if (typeof mod.default === "function") {
					// ── Legacy extension (export default) ────────
					const basename = path.basename(fullPath, ".ts");
					const id = group ? `${group}/${basename}` : basename;
					const meta: ModuleMeta = {
						id,
						name: humanize(basename),
						description: extractDescription(fullPath),
						group,
					};
					modules.push({ meta, type: "legacy", initLegacy: mod.default, file: entry });
				}
			} catch (err) {
				console.error(`[superpowers] Failed to load ${entry}:`, err);
			}
		}
	}

	scanDir(extensionDir);
	// Sort: native first, then legacy. Within each group, alphabetical.
	modules.sort((a, b) => {
		if (a.meta.group !== b.meta.group) {
			if (!a.meta.group) return -1;
			if (!b.meta.group) return 1;
			return a.meta.group.localeCompare(b.meta.group);
		}
		return a.meta.name.localeCompare(b.meta.name);
	});
	return modules;
}

// ── Proxy Wrapper for Legacy Extensions ──────────────────────────────
//
// Wraps the ExtensionAPI so legacy extensions get runtime enable/disable
// without requiring code changes. All registrations happen at init (so
// Pi sees the tools/commands), but execution is gated by isEnabled().

function createGatedProxy(realPi: ExtensionAPI, isEnabled: () => boolean, moduleId: string): ExtensionAPI {
	const handler: ProxyHandler<ExtensionAPI> = {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);

			// ── registerTool: wrap execute() ─────────────────
			if (prop === "registerTool") {
				return (def: any) => {
					const origExecute = def.execute;
					def.execute = async (...args: any[]) => {
						if (!isEnabled()) {
							return {
								content: [{ type: "text", text: `⚡ Extension "${moduleId}" is disabled. Enable it with /extensions.` }],
								details: { disabled: true, moduleId },
							};
						}
						return origExecute(...args);
					};
					return (target as any).registerTool(def);
				};
			}

			// ── registerCommand: wrap handler() ──────────────
			if (prop === "registerCommand") {
				return (name: string, def: any) => {
					const origHandler = def.handler;
					def.handler = async (...args: any[]) => {
						if (!isEnabled()) {
							const ctx = args[1] as ExtensionContext | undefined;
							ctx?.ui?.notify?.(`⚡ "${moduleId}" is disabled. Enable it with /extensions.`, "warning");
							return;
						}
						return origHandler(...args);
					};
					return (target as any).registerCommand(name, def);
				};
			}

			// ── registerShortcut: wrap handler() ─────────────
			if (prop === "registerShortcut") {
				return (shortcut: string, opts: any) => {
					const origHandler = opts.handler;
					opts.handler = async (...args: any[]) => {
						if (!isEnabled()) return;
						return origHandler(...args);
					};
					return (target as any).registerShortcut(shortcut, opts);
				};
			}

			// ── on(): wrap event handlers ────────────────────
			if (prop === "on") {
				return (eventName: string, handler: (...args: any[]) => any) => {
					const wrappedHandler = async (...args: any[]) => {
						if (!isEnabled()) {
							// Return safe no-ops for events that expect return values
							if (eventName === "tool_call") return { block: false };
							if (eventName === "before_agent_start") return {};
							if (eventName === "input") return undefined;
							return;
						}
						return handler(...args);
					};
					return (target as any).on(eventName, wrappedHandler);
				};
			}

			// ── sendMessage: gate behind isEnabled ───────────
			if (prop === "sendMessage") {
				return (...args: any[]) => {
					if (!isEnabled()) return;
					return (target as any).sendMessage(...args);
				};
			}

			// ── Everything else: passthrough ─────────────────
			if (typeof value === "function") return value.bind(target);
			return value;
		},
	};

	return new Proxy(realPi, handler);
}

// ── Extension Entry Point ────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let settings = loadSettings();

	// Discover all modules from this directory + subdirectories
	const extensionDir = path.dirname(new URL(import.meta.url).pathname);
	const allModules = discoverModules(extensionDir);

	// ── Initialize ALL modules ──────────────────────────────────────

	for (const mod of allModules) {
		const id = mod.meta.id;
		const isEnabled = () => settings.enabled[id] === true;

		if (mod.type === "native" && mod.initNative) {
			mod.initNative(pi, isEnabled);
		} else if (mod.type === "legacy" && mod.initLegacy) {
			const proxy = createGatedProxy(pi, isEnabled, id);
			mod.initLegacy(proxy);
		}
	}

	// ── Status line ─────────────────────────────────────────────────

	function updateStatus(ctx: ExtensionContext) {
		const active = allModules.filter(m => settings.enabled[m.meta.id]);
		if (active.length === 0) {
			ctx.ui.setStatus("superpowers", "⚡ Extensions: none — /extensions to configure");
		} else {
			ctx.ui.setStatus("superpowers", `⚡ ${active.map(m => m.meta.name).join(" · ")}`);
		}
	}

	// ── Toggle handler (shared by /extensions and /superpowers) ─────

	interface Row {
		kind: "module" | "separator" | "action";
		label: string;
		moduleIdx?: number;
		action?: "save" | "disable-all" | "enable-all";
	}

	function buildRows(): Row[] {
		const rows: Row[] = [];
		let lastGroup: string | undefined;

		for (let i = 0; i < allModules.length; i++) {
			const mod = allModules[i];
			const group = mod.meta.group;
			if (group !== lastGroup) {
				if (lastGroup !== undefined || group) {
					rows.push({ kind: "separator", label: group ? `── ${group} ──` : "── core ──" });
				}
				lastGroup = group;
			}
			const on = settings.enabled[mod.meta.id] === true;
			const badge = mod.type === "legacy" ? " [ext]" : "";
			rows.push({
				kind: "module",
				label: `${on ? "✅" : "⬜"} ${mod.meta.name} — ${mod.meta.description}${badge}`,
				moduleIdx: i,
			});
		}

		rows.push({ kind: "separator", label: "─────────────────────" });
		rows.push({ kind: "action", label: "🚫 Disable All", action: "disable-all" });
		rows.push({ kind: "action", label: "✅ Enable All", action: "enable-all" });
		rows.push({ kind: "action", label: "✕ Close", action: "close" });
		return rows;
	}

	function selectableIndices(rows: Row[]): number[] {
		return rows.map((r, i) => r.kind !== "separator" ? i : -1).filter(i => i >= 0);
	}

	async function toggleHandler(_args: string, ctx: ExtensionContext) {
		let dirty = false;

		await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
			let cursor = 0;
			let rows = buildRows();
			let selectable = selectableIndices(rows);
			let cachedWidth: number | undefined;
			let cachedLines: string[] | undefined;

			function rebuild() {
				rows = buildRows();
				selectable = selectableIndices(rows);
				if (cursor >= selectable.length) cursor = selectable.length - 1;
				if (cursor < 0) cursor = 0;
				cachedWidth = undefined;
				cachedLines = undefined;
			}

			// Auto-save after any change
			function save() {
				saveSettings(settings);
				dirty = true;
			}

			return {
				handleInput(data: string) {
					if ((matchesKey(data, Key.up) || matchesKey(data, "k")) && cursor > 0) {
						cursor--;
						cachedWidth = undefined;
					} else if ((matchesKey(data, Key.down) || matchesKey(data, "j")) && cursor < selectable.length - 1) {
						cursor++;
						cachedWidth = undefined;
					} else if (matchesKey(data, Key.enter) || matchesKey(data, " ") || matchesKey(data, "l")) {
						const rowIdx = selectable[cursor];
						const row = rows[rowIdx];
						if (row.kind === "module" && row.moduleIdx !== undefined) {
							const mod = allModules[row.moduleIdx];
							settings.enabled[mod.meta.id] = !settings.enabled[mod.meta.id];
							save();
							rebuild();
						} else if (row.action === "close") {
							done();
							return;
						} else if (row.action === "disable-all") {
							for (const m of allModules) settings.enabled[m.meta.id] = false;
							save();
							rebuild();
						} else if (row.action === "enable-all") {
							for (const m of allModules) settings.enabled[m.meta.id] = true;
							save();
							rebuild();
						}
					} else if (matchesKey(data, Key.escape) || matchesKey(data, "q") || matchesKey(data, "h")) {
						done();
						return;
					}
				},

				render(width: number): string[] {
					if (cachedLines && cachedWidth === width) return cachedLines;

					const title = theme.fg("accent", theme.bold("⚡ Extensions")) +
						theme.fg("dim", "  (j/k navigate · l/enter/space toggle · h/q/esc close)");
					const lines: string[] = [truncateToWidth(title, width), ""];

					const activeRowIdx = selectable[cursor];
					for (let i = 0; i < rows.length; i++) {
						const row = rows[i];
						const isActive = i === activeRowIdx;

						if (row.kind === "separator") {
							lines.push(truncateToWidth(theme.fg("dim", `  ${row.label}`), width));
						} else {
							const pointer = isActive ? theme.fg("accent", "❯ ") : "  ";
							const text = isActive ? theme.fg("accent", row.label) : row.label;
							lines.push(truncateToWidth(pointer + text, width));
						}
					}

					const active = allModules.filter(m => settings.enabled[m.meta.id]);
					lines.push("");
					lines.push(truncateToWidth(
						theme.fg("dim", `  ${active.length}/${allModules.length} enabled  `) +
						theme.fg("dim", dirty ? "✓ auto-saved" : ""),
						width,
					));

					cachedWidth = width;
					cachedLines = lines;
					return lines;
				},

				invalidate() {
					cachedWidth = undefined;
					cachedLines = undefined;
				},
			};
		});

		if (dirty) {
			updateStatus(ctx);
			const active = allModules.filter(m => settings.enabled[m.meta.id]);
			ctx.ui.notify(
				`⚡ Extensions saved.\nActive: ${active.map(m => m.meta.name).join(", ") || "none"}`,
				"info",
			);
		}
	}

	// ── /extensions — primary command ───────────────────────────────

	pi.registerCommand("extensions", {
		description: "View and enable/disable extensions",
		handler: toggleHandler,
	});

	// ── /superpowers — alias ────────────────────────────────────────

	pi.registerCommand("superpowers", {
		description: "Alias for /extensions — toggle modules on/off",
		handler: toggleHandler,
	});

	// ── Session lifecycle ───────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		settings = loadSettings();
		updateStatus(ctx);

		if (!Object.keys(settings.enabled).length && ctx.hasUI) {
			ctx.ui.notify("⚡ Extensions loaded! Use /extensions to configure.", "info");
		}
	});

	// ── System prompt injection ─────────────────────────────────────

	pi.on("before_agent_start", async (event, _ctx) => {
		const active = allModules.filter(m => settings.enabled[m.meta.id]);
		if (active.length === 0) return {};

		const nativeWithPrompts = active.filter(m => m.type === "native" && m.meta.systemPromptWhenEnabled);
		if (nativeWithPrompts.length === 0) return {};

		const parts = [
			`\n\n## Active Superpowers: ${nativeWithPrompts.map(m => m.meta.name).join(", ")}`,
			...nativeWithPrompts.map(m => m.meta.systemPromptWhenEnabled!),
		];

		return { systemPrompt: event.systemPrompt + parts.join("\n\n") };
	});
}
