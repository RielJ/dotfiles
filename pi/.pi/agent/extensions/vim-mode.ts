/**
 * Vim Mode — Modal editing for pi
 *
 * Modes:
 *   INSERT  — default text editing (Escape → NORMAL)
 *   NORMAL  — vim navigation & commands (i/a/A/o/O → INSERT)
 *   COMMAND — ex commands (:w, :q, :wq)
 *
 * Normal mode keys:
 *   h/j/k/l    — move left/down/up/right
 *   w/b        — word forward/backward
 *   0/$        — line start/end
 *   x          — delete char
 *   dw/db      — delete word forward/backward
 *   dd         — delete line
 *   d$/d0      — delete to end/start of line
 *   diw        — delete inner word
 *   cw/cb      — change word forward/backward
 *   cc         — change line (delete + insert)
 *   c$/c0      — change to end/start of line
 *   ciw        — change inner word
 *   yy         — yank line (TODO: clipboard)
 *   o/O        — open line below/above
 *   A          — append at end of line
 *   I          — insert at start of line
 *   G          — go to last line
 *   gg         — go to first line
 *   u          — undo
 *
 * Command mode:
 *   :w         — send message (submit)
 *   :q         — quit pi
 *   :wq        — send message then quit
 *   :clear     — clear editor
 *
 * Usage: auto-loaded from ~/.pi/agent/extensions/
 */

import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";

type Mode = "normal" | "insert" | "command";

class VimEditor extends CustomEditor {
  private mode: Mode = "insert";
  private cmdBuffer = "";
  private pendingKeys = "";
  private shutdownFn: (() => void) | undefined;

  setShutdown(fn: () => void) {
    this.shutdownFn = fn;
  }

  handleInput(data: string): void {
    if (this.mode === "command") {
      this.handleCommandMode(data);
      return;
    }

    // Escape: insert → normal, normal → pass through (abort agent)
    if (matchesKey(data, "escape")) {
      if (this.mode === "insert") {
        this.mode = "normal";
        this.pendingKeys = "";
      } else {
        super.handleInput(data);
      }
      return;
    }

    if (this.mode === "insert") {
      super.handleInput(data);
      return;
    }

    this.handleNormalMode(data);
  }

  private handleNormalMode(data: string): void {
    const seq = this.pendingKeys + data;

    // --- Multi-key sequences ---

    // g-combos
    if (seq === "gg") {
      this.pendingKeys = "";
      super.handleInput("\x1b[1;5H"); // ctrl+home
      return;
    }

    // d-combos (delete)
    if (seq === "dd") {
      this.pendingKeys = "";
      this.deleteLine();
      return;
    }
    if (seq === "dw") {
      this.pendingKeys = "";
      this.vimDeleteWordForward();
      return;
    }
    if (seq === "db") {
      this.pendingKeys = "";
      this.vimDeleteWordBackward();
      return;
    }
    if (seq === "d$") {
      this.pendingKeys = "";
      super.handleInput("\x0b"); // ctrl+k (kill to EOL)
      return;
    }
    if (seq === "d0") {
      this.pendingKeys = "";
      this.vimDeleteToLineStart();
      return;
    }
    if (seq === "diw") {
      this.pendingKeys = "";
      this.vimDeleteInnerWord();
      return;
    }
    if (seq === "di") {
      this.pendingKeys = "di";
      return;
    }

    // c-combos (change = delete + insert)
    if (seq === "cc") {
      this.pendingKeys = "";
      this.deleteLine();
      this.mode = "insert";
      return;
    }
    if (seq === "cw") {
      this.pendingKeys = "";
      this.vimDeleteWordForward();
      this.mode = "insert";
      return;
    }
    if (seq === "cb") {
      this.pendingKeys = "";
      this.vimDeleteWordBackward();
      this.mode = "insert";
      return;
    }
    if (seq === "c$") {
      this.pendingKeys = "";
      super.handleInput("\x0b"); // kill to EOL
      this.mode = "insert";
      return;
    }
    if (seq === "c0") {
      this.pendingKeys = "";
      this.vimDeleteToLineStart();
      this.mode = "insert";
      return;
    }
    if (seq === "ciw") {
      this.pendingKeys = "";
      this.vimDeleteInnerWord();
      this.mode = "insert";
      return;
    }
    if (seq === "ci") {
      this.pendingKeys = "ci";
      return;
    }

    // y-combos (yank)
    if (seq === "yy") {
      this.pendingKeys = "";
      return;
    }

    // --- Pending key starters ---
    // If first key of a multi-key combo, wait for next key
    if (
      this.pendingKeys === "" &&
      (data === "g" || data === "d" || data === "c" || data === "y")
    ) {
      this.pendingKeys = data;
      return;
    }

    // Nothing matched — clear pending
    this.pendingKeys = "";

    // Single key mappings
    switch (data) {
      // Movement
      case "h":
        super.handleInput("\x1b[D");
        break; // left
      case "j":
        super.handleInput("\x1b[B");
        break; // down
      case "k":
        super.handleInput("\x1b[A");
        break; // up
      case "l":
        super.handleInput("\x1b[C");
        break; // right
      case "w":
        this.wordForward();
        break;
      case "b":
        this.wordBackward();
        break;
      case "0":
        super.handleInput("\x01");
        break; // home
      case "$":
        super.handleInput("\x05");
        break; // end
      case "G":
        super.handleInput("\x1b[1;5F");
        break; // ctrl+end

      // Editing
      case "x":
        super.handleInput("\x1b[3~");
        break; // delete
      case "u":
        super.handleInput("\x1a");
        break; // undo (ctrl+z)

      // Mode switches
      case "i":
        this.mode = "insert";
        break;
      case "a":
        this.mode = "insert";
        super.handleInput("\x1b[C");
        break; // append
      case "A":
        this.mode = "insert";
        super.handleInput("\x05");
        break; // append at EOL
      case "I":
        this.mode = "insert";
        super.handleInput("\x01");
        break; // insert at BOL
      case "o":
        super.handleInput("\x05");
        this.mode = "insert";
        super.handleInput("\n");
        break; // open below
      case "O":
        super.handleInput("\x01");
        this.mode = "insert";
        super.handleInput("\n");
        super.handleInput("\x1b[A");
        break; // open above

      // Command mode
      case ":":
        this.mode = "command";
        this.cmdBuffer = "";
        break;

      // Pass control sequences through
      default:
        if (data.length > 1 || data.charCodeAt(0) < 32) {
          super.handleInput(data);
        }
        break;
    }
  }

  private handleCommandMode(data: string): void {
    if (matchesKey(data, "escape")) {
      this.mode = "normal";
      this.cmdBuffer = "";
      return;
    }

    if (matchesKey(data, "return")) {
      this.executeCommand(this.cmdBuffer.trim());
      this.cmdBuffer = "";
      this.mode = "normal";
      return;
    }

    if (matchesKey(data, "backspace")) {
      if (this.cmdBuffer.length > 0) {
        this.cmdBuffer = this.cmdBuffer.slice(0, -1);
      } else {
        this.mode = "normal";
      }
      return;
    }

    // Printable characters
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.cmdBuffer += data;
    }
  }

  private executeCommand(cmd: string): void {
    switch (cmd) {
      case "w":
        // Submit the message (simulate Enter)
        super.handleInput("\r");
        break;
      case "q":
        this.shutdownFn?.();
        break;
      case "wq":
        super.handleInput("\r");
        this.shutdownFn?.();
        break;
      case "clear":
        // ctrl+c to clear
        super.handleInput("\x03");
        break;
      default:
        break;
    }
  }

  // Word forward: move to start of next word
  private wordForward(): void {
    // Move right by emitting ctrl+right (word forward)
    super.handleInput("\x1b[1;5C");
  }

  // Word backward: move to start of previous word
  private wordBackward(): void {
    super.handleInput("\x1b[1;5D");
  }

  // Delete current line
  private deleteLine(): void {
    super.handleInput("\x01"); // home
    super.handleInput("\x0b"); // kill to end (ctrl+k)
    super.handleInput("\x7f"); // backspace to join with prev
  }

  // Delete word forward (dw)
  private vimDeleteWordForward(): void {
    super.handleInput("\x1b[1;6C"); // ctrl+shift+right (select word)
    super.handleInput("\x1b[3~"); // delete selection
  }

  // Delete word backward (db)
  private vimDeleteWordBackward(): void {
    super.handleInput("\x1b[1;6D"); // ctrl+shift+left (select word back)
    super.handleInput("\x1b[3~"); // delete selection
  }

  // Delete to line start (d0)
  private vimDeleteToLineStart(): void {
    super.handleInput("\x1b[1;2H"); // shift+home (select to start)
    super.handleInput("\x1b[3~"); // delete selection
  }

  // Delete inner word (diw/ciw)
  private vimDeleteInnerWord(): void {
    super.handleInput("\x1b[1;5D"); // ctrl+left (word back)
    super.handleInput("\x1b[1;6C"); // ctrl+shift+right (select word)
    super.handleInput("\x1b[3~"); // delete selection
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length === 0) return lines;

    // Build mode indicator
    const last = lines.length - 1;
    let label: string;
    if (this.mode === "command") {
      label = ` :${this.cmdBuffer}█ `;
    } else if (this.mode === "normal") {
      const pending = this.pendingKeys ? ` ${this.pendingKeys}` : "";
      label = ` NORMAL${pending} `;
    } else {
      label = " INSERT ";
    }

    const labelLen = visibleWidth(label);
    const lineWidth = visibleWidth(lines[last]!);
    if (lineWidth >= labelLen) {
      lines[last] = truncateToWidth(lines[last]!, width - labelLen, "") + label;
    }

    return lines;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, kb) => {
      const editor = new VimEditor(tui, theme, kb);
      editor.setShutdown(() => ctx.shutdown());
      return editor;
    });
  });
}
