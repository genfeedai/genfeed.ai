---
name: Desktop skills run in a Claude Code session in the Desktop terminal
description: Why a skill tagged local runs in the Desktop terminal instead of through the agent panel, and what the session may and may not do
type: project
status: active
last_verified: 2026-11-25
topics: [skills, desktop, terminal, security]
---

**Decision (Vincent, 2026-11-25, #11286):** a skill that needs this machine (Chrome, ffmpeg, a local render) runs in a `claude` session in the Desktop terminal. It is marked `runsOn: 'desktop'`. On web it shows Get Desktop and no run action.

**Why:** Desktop agent turns run Claude Code with its file and shell tools off and only the Genfeed tools allowed, so a skill that renders locally cannot run through the agent panel. Turning those tools on for one skill's turn would widen what every skill-driven turn may do; a terminal session keeps the permission prompt in front of the member.

**How to apply:**
- `runsOn` is read from the skill's `metadata.json` tag `local` at catalog load and stored in `Skill.config`. It needs no migration. A row without it runs on web.
- The terminal session is opened with the skill's instructions as its one argument, never through a shell, and never with a permission flag. Do not add `--dangerously-skip-permissions` or an allow list to it.
- Desktop asks the member to allow the first terminal of each launch. Keep that confirmation.
- A new desktop skill is a `local` tag in `genfeedai/skills`; nothing in this repository lists them.
