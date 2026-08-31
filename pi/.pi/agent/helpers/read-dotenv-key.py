#!/usr/bin/env python3
import sys
from pathlib import Path


def parse_value(raw: str) -> str:
    s = raw.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in {'"', "'"}:
        s = s[1:-1]
    return s


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: read-dotenv-key.py <dotenv-path> <KEY>", file=sys.stderr)
        return 2
    env_path = Path(sys.argv[1]).expanduser()
    key = sys.argv[2]
    try:
        text = env_path.read_text()
    except FileNotFoundError:
        return 1
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        if k.strip() == key:
            sys.stdout.write(parse_value(v))
            return 0
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
