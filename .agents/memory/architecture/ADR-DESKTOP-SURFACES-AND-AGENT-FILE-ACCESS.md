# ADR: Desktop Surfaces and Agent File Access

## Status

Accepted. The surface table and the file access rule are the owner's decisions of 25 and 26 November 2026 (genfeed.ai #11250, epic #11249). The file access rule is **not in force yet**: the current rule stands until #11252 proves the folder boundary (see "Until then").

## Last Updated

2026-11-27

## Canonical Source

This file. Summaries that must agree with it: [`docs/execution-boundaries.md`](../../../docs/execution-boundaries.md), [`docs/deployment-modes.md`](../../../docs/deployment-modes.md) and [`project_desktop_cli_agent_runtime.md`](../project_desktop_cli_agent_runtime.md). Desktop has no local mode ([decisions-desktop-local-mode-removed](../decisions-desktop-local-mode-removed.md)).

## Context

A real edit (a 41 minute, 1080p recording cut into a recap and five vertical shorts) was reviewed on 25 November 2026. It ran entirely on the user's machine: a local transcript, hundreds of `ffmpeg` and `ffprobe` calls, Python build scripts the agent wrote per episode, and motion overlays rendered through a headless browser. No Genfeed call appeared in those sessions. The project folder was 17 GB; the files that mattered at the end were about 0.7 GB. The only cloud step was an upload script at the end.

Two things followed. A fixed list of tools would not run that workflow, because the agent writes and runs its own scripts. And moving creation out of the web app would remove it for everyone who is not on macOS, because Desktop builds for macOS only.

## The owner's decision, quoted

From genfeed.ai #11250, "Direction locked by the owner, 25 November 2026" (the table is the record of his answers on cards):

> | What the web app keeps | Everything. Nothing is removed from the web. Desktop adds the project folder, local agents and local renders. |
> | Where assets live | The cloud Library is the one list. Only the final product is uploaded. The user can send any other file by choice. Intermediates stay on disk. |
> | Projects home | `~/.genfeedai/projects` by default, one folder per project, survives a reinstall, movable in Settings, with a "show in file manager" action per project. |
> | Agent file access | **Changed.** A Desktop agent turn may read and write inside its own project folder and run any tool or script there. Nothing outside the folder. The boundary is enforced by the operating system, not by a prompt, and has to be proven before it ships (#11252). Until then the current rule stands: Genfeed MCP tools only (`apps/desktop/src/main/cli-agent-args.util.ts`). |
> | Where the local or cloud choice sits | In the model picker, everywhere a model is picked. No top bar switch, no per-app control. |

And "Further decisions from the owner, 26 November 2026": generation from Desktop goes through the cloud API on credits; Codex images on the user's own plan are kept; local mode is closed for good. In his words that day: "the desktop will be using the cloud API anyway. I don't want to have a desktop local generation or something. I just want to use the cloud API, but have the desktop access to CLI and stuff like that." The safety rule change is his explicit decision of 25 November 2026.

## Decision

### 1. Every surface is on the web; Desktop adds to it

The web app keeps everything. Nothing is removed from it for Desktop. Desktop is the same app on the same API (Genfeed Cloud or a self-hosted server) plus what only a machine gives.

| Surface | Web | Desktop | Notes |
| --- | --- | --- | --- |
| Workspace, Discovery, Library, Publishing, Analytics, Agent, Playground (Studio) | yes | yes | Rail apps of the `daily` group |
| Storyboard, Turbo, Motion, Clipper, Editor, Automation, Messages | yes | yes | Rail apps of the `app` group. The web renders through the cloud runner (#11256) once it exists; Desktop renders locally. Both show them (owner, 26 November 2026) |
| Brand, Settings, billing, credentials and channels | yes | yes | |
| Admin (`/admin`) | yes | no | `apps/desktop/scripts/exclude-desktop-routes.cjs` leaves it out of the Desktop build. There is no separate admin app (decision of 26 November 2026) |
| Workspace folder and projects home | no | yes | |
| Terminal (shell, Genfeed CLI, Claude Code, Codex) | no | yes | |
| Workspace agent (file and shell tools inside one folder) | no | yes | Not built; #11252 |
| Local renders and skills tagged `runsOn: 'desktop'` | no | yes | On the web such a skill shows Get Desktop and no run action ([decisions-desktop-skills-run-in-terminal](../decisions-desktop-skills-run-in-terminal.md)) |

The open question of the issue (do Timeline, Clipper and Motion stay on the web or become Desktop only) is answered by the owner's "everything" for the web.

### 2. Where work and files live

- The cloud Library is the one list of assets. Opening a Library asset downloads a local copy; only the final product is uploaded, one way, to the Library folder paired with the project. An upload never publishes.
- Everything else (raw footage, graded copies, per-act renders, previews) stays on disk and is never synced. The user can send any other file by choice.
- Projects live under `~/.genfeedai/projects`, one folder per project. It survives a reinstall, the location can be changed in Settings, and each project has a "show in file manager" action because a dot folder is hidden.
- Generation from Desktop goes through the cloud API on credits. No local models and no generation on the user's own provider keys. Generating through a local CLI on the user's own plan (Codex images) is allowed, as long as the result lands in the cloud Library.
- The local or cloud choice is made in the model picker, everywhere a model is picked, as one grouped list: "This computer" above "Cloud".

### 3. Agent file access

A Desktop agent turn may read and write **inside its own project folder** and run any tool or script there. Nothing outside the folder. The boundary is enforced by the operating system, not by a prompt, and it is proven before it ships (#11252). The agent turn never gets file or shell tools outside one workspace folder the user picked, and the user confirms the folder in a native dialog that page script cannot answer.

A fixed tool list was rejected: it cannot run a workflow in which the agent writes its own scripts.

Ordinary agent turns (no workspace folder) keep their built-in tools off (`--tools ""` for Claude Code, a read-only sandbox for Codex) and act only through Genfeed MCP tools.

### Until then

Today's rule stands: a Desktop agent turn may use only Genfeed MCP tools (`apps/desktop/src/main/cli-agent-args.util.ts`). Skills that need this machine run in a `claude` session in the Desktop terminal, where the permission prompt stays in front of the user. Nothing in this ADR widens what a turn may do before #11252 lands and shows the boundary holds.

The path guard already exists for the folder itself: `resolveRealPathInsideRoot` (`packages/desktop-core`) refuses `..`, absolute paths and symlinks that lead out of the folder. It is a guard for Desktop's own file calls, not the operating system fence that #11252 owes for the agent.

## Why

- The measured edit needs arbitrary tools and scripts, which only a folder-scoped, OS-enforced boundary can allow safely.
- Final products only keeps one source of truth (the Library) and needs no two-way sync. Local mode's sync was the reason it was closed.
- Keeping everything on the web means no one loses a creative app because they are not on macOS.

## Consequences

- `AGENTS.md` says a policy change of this kind needs an explicit instruction from the owner; this ADR records it (his decision table of 25 November 2026 on #11250, "Agent file access: Changed"), so #11252 may implement it. No agent may widen the rule further on its own.
- The rule that Desktop agent turns never get file or shell tools is narrowed to "outside a workspace folder the user picked", and only once #11252 ships.
- The children of epic #11249 build on this table: #11266 (project folder in cloud mode), #11252 (folder boundary and the agent in it), #11254 (upload of final products), #11253 (toolchain check), #11251, #11255 and #11256.
