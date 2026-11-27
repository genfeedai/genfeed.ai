---
name: Desktop editing toolchain is detected and guided, never bundled or silently installed
description: Why Desktop looks for ffmpeg, a browser, Bun, Python, speech to text, yt-dlp and the Genfeed CLI, shows an install command, and signs the CLI in with the Desktop session
type: project
status: active
last_verified: 2026-11-27
topics: [desktop, cli, toolchain, editing]
---

**Decision (genfeed.ai #11253, epic #11249):** Desktop checks which editing tools the machine has and tells the user what is missing, too old, or found. It installs nothing and bundles nothing, including the Genfeed CLI.

**Why:**

- The 150 MiB app-shell budget (#11060) is not raised, and a skill that fails halfway through with a shell error is worse than one that names the missing tool.
- The reviewed edit (#11250) called ffmpeg and ffprobe, a speech-to-text tool, a headless browser, Python and Bun. The tools differ per user's machine, so a guided install (one `brew` or `npm` command per tool) fits better than a bundle that would be stale on arrival.
- The Genfeed CLI is a Node package (`npm install -g @genfeedai/cli`). Bundling it means shipping a Node runtime or a second build target; the existing launch wrapper already prints the install command.

**How to apply:**

- The list and the minimums live in `apps/desktop/src/main/editing-tools.util.ts`. A minimum comes from a skill in `genfeedai/skills` that states it (Bun 1.1+, ffmpeg 5.0+); do not invent one. Add a tool there when a skill needs it.
- No silent installs. Show the command; the user runs it.
- The Genfeed CLI session gets the Desktop session's `gf_` key and server as `GENFEED_API_KEY` and `GENFEED_API_URL`, so the CLI needs no second browser login. Only that session kind gets them; the fallback shell the wrapper opens when `gf` is missing has them removed. Never give them to a plain shell or an agent CLI.
- A skill or render that needs a tool must stop before it starts and name it. The check is not wired to a job runner yet (#11251).
