"""Count how pi sessions use tools, slash commands, custom entries, and skills.

Reads ~/.pi/agent/sessions/**/*.jsonl and prints one table per signal.
Each row shows: total hits, distinct sessions, sessions outside the dotfiles
agent repo ("field"), and the date of the last hit.

Run: uv run docs/research/usage_audit.py [tools|slash|custom|skills]
Extension slash commands are not stored in session logs, so extension usage
must be inferred from the tools and custom entries they register.
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

HOME = Path.home()
SESSIONS = HOME / ".pi/agent/sessions"
SELF_CWD = str(HOME / "dotfiles/pi/.pi/agent")
SKILL_DIRS = [
    HOME / ".pi/agent/skills",
    HOME / ".agents/skills",
    HOME / "dotfiles/pi/.pi/agent/.pi/skills",
]
SKILL_PATH = re.compile(r"skills/([\w:-]+)/")
SKILL_TAG = re.compile(r'<skill name="([\w:-]+)"')
SLASH = re.compile(r"\s*/([\w:-]+)")


@dataclass
class Count:
    hits: int = 0
    sessions: set[str] = field(default_factory=set)
    field_sessions: set[str] = field(default_factory=set)
    last: str = ""

    def add(self, session: str, ts: str, *, in_field: bool) -> None:
        self.hits += 1
        self.sessions.add(session)
        if in_field:
            self.field_sessions.add(session)
        self.last = max(self.last, ts)


Table = defaultdict[str, Count]


def installed_skills() -> set[str]:
    dirs = [*SKILL_DIRS, *(HOME / ".pi/agent/npm/node_modules").glob("**/skills")]
    return {p.parent.name for d in dirs if d.is_dir() for p in d.glob("*/SKILL.md")}


def user_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(i.get("text", "") for i in content if isinstance(i, dict))
    return ""


def scan_file(path: Path, tables: dict[str, Table]) -> None:
    sid = path.name
    cwd = ""
    with path.open(errors="ignore") as fh:
        for line in fh:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            kind = entry.get("type")
            ts = (entry.get("timestamp") or "")[:10]
            if kind == "session":
                cwd = entry.get("cwd", "")
            in_field = cwd != SELF_CWD
            if kind in ("custom", "custom_message"):
                tables["custom"][entry.get("customType", "?")].add(sid, ts, in_field=in_field)
            if kind != "message":
                continue
            msg = entry.get("message", {})
            content = msg.get("content")
            if msg.get("role") == "assistant" and isinstance(content, list):
                for item in content:
                    if item.get("type") != "toolCall":
                        continue
                    name = item.get("name", "?")
                    args = item.get("arguments") or {}
                    tables["tools"][name].add(sid, ts, in_field=in_field)
                    if name == "subagent":
                        for s in args.get("skills") or []:
                            skill = s if isinstance(s, str) else s.get("name", "?")
                            tables["skills"][skill].add(sid, ts, in_field=True)
                    if name.lower() in ("read", "bash"):
                        for skill in SKILL_PATH.findall(json.dumps(args)):
                            tables["skills"][skill].add(sid, ts, in_field=in_field)
            if msg.get("role") == "user":
                text = user_text(content)
                if m := SLASH.match(text):
                    tables["slash"][m.group(1)].add(sid, ts, in_field=in_field)
                for skill in SKILL_TAG.findall(text):
                    tables["skills"][skill].add(sid, ts, in_field=True)


def main() -> None:
    wanted = sys.argv[1:] or ["tools", "slash", "custom", "skills"]
    tables: dict[str, Table] = {k: defaultdict(Count) for k in ("tools", "slash", "custom", "skills")}
    files = sorted(SESSIONS.glob("**/*.jsonl"))
    for path in files:
        scan_file(path, tables)
    for skill in installed_skills():
        tables["skills"].setdefault(skill, Count())
    print(f"{len(files)} session files")
    for name in wanted:
        print(f"\n== {name}\nname|hits|sessions|field|last")
        rows = sorted(tables[name].items(), key=lambda kv: (-len(kv[1].field_sessions), -kv[1].hits))
        for key, c in rows:
            print(f"{key}|{c.hits}|{len(c.sessions)}|{len(c.field_sessions)}|{c.last or '-'}")


if __name__ == "__main__":
    main()
