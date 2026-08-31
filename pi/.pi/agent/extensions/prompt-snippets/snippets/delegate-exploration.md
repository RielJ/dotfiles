---
name: Delegate exploration
description: Subagents explore, you verify the critical parts
placement: append
order: 30
---
Keep your context window lean. Delegate codebase exploration to subagents with `subagent({ profile: "explore", ... })`, and ask each one a specific, targeted question instead of reading many files yourself. Pass what they need through `context`, since they do not inherit this conversation. Read files directly only to verify the critical parts of what they report.
