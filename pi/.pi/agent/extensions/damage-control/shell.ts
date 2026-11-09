/**
 * Just enough shell parsing to find command names and their arguments.
 * Not a full parser: heredoc bodies are read as ordinary words and lines, which errs toward
 * seeing more commands, not fewer.
 */

export type Token = { text: string; boundary: boolean };

const SEPARATORS = new Set([";", "&", "|", "\n", "(", ")", "`", "{", "}"]);

/** Split a shell command into words; separators become boundary tokens. Quotes are honoured. */
export function tokenize(command: string): Token[] {
  const tokens: Token[] = [];
  let word = "";
  let inWord = false;
  const flush = () => {
    if (inWord) tokens.push({ text: word, boundary: false });
    word = "";
    inWord = false;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      const stop = end === -1 ? command.length : end;
      word += command.slice(i + 1, stop);
      inWord = true;
      i = stop;
    } else if (c === '"') {
      let j = i + 1;
      while (j < command.length && command[j] !== '"') {
        if (command[j] === "\\" && j + 1 < command.length) j++;
        word += command[j];
        j++;
      }
      inWord = true;
      i = j;
    } else if (c === "\\" && i + 1 < command.length) {
      word += command[++i];
      inWord = true;
    } else if (c === "$" && command[i + 1] === "(") {
      flush();
      tokens.push({ text: "$(", boundary: true });
      i++;
    } else if (SEPARATORS.has(c) && !(c === "{" && command[i - 1] === "$") && !(c === "}" && word.includes("${"))) {
      flush();
      tokens.push({ text: c, boundary: true });
    } else if (c === " " || c === "\t" || c === "\r") {
      flush();
    } else {
      word += c;
      inWord = true;
    }
  }
  flush();
  return tokens;
}

/** The simple commands in a command line, each as a list of words. */
export function simpleCommands(command: string): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  for (const t of tokenize(command)) {
    if (t.boundary) {
      if (current.length) out.push(current);
      current = [];
    } else current.push(t.text);
  }
  if (current.length) out.push(current);
  return out;
}

/** Words that may precede the real command name. */
const PREFIXES = new Set(["sudo", "command", "exec", "nohup", "time", "env", "xargs", "then", "do", "else", "!"]);

/** Drop leading prefixes and VAR=value assignments; returns [name, ...args]. */
export function commandWords(words: string[]): string[] {
  let i = 0;
  while (i < words.length && (PREFIXES.has(words[i]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) i++;
  return words.slice(i);
}

/** Basename of a command word: `/usr/bin/pkill` → `pkill`. */
export function commandName(word: string | undefined): string | undefined {
  return word?.split("/").pop();
}
