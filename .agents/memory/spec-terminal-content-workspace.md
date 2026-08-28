---
name: Terminal content workspace
description: Shared CLI and interactive TUI contract for authenticated Genfeed content operations
type: project
status: active
last_verified: 2026-08-28
topics: [cli, tui, auth, credits, generation, brands, workflows]
---

# Terminal Content Workspace Spec

## Purpose

Make `gf` a complete terminal entry point for Genfeed: an interactive content
workspace when launched in a terminal and a deterministic automation client when
invoked with commands. Both surfaces use the same authenticated API operations,
scope, credit ledger, generation jobs, and workflow execution contracts.

## Non-Goals

- Mirroring every HTTP endpoint into the CLI or TUI.
- Creating a second agent action catalog or workflow engine.
- Collecting card details, passwords, or wallet secrets in the terminal.
- Adding a crypto payment provider before Genfeed selects and approves one.
- Implementing enterprise SSO beyond the existing separately tracked CLI auth work.
- Replacing the web app for detailed editing, administration, or billing history.

## Interfaces

### Process behavior

- `gf` launches the interactive TUI only when stdin and stdout are TTYs.
- `gf` without a TTY prints actionable help and exits without waiting for input.
- `gf <command>` remains deterministic and suitable for scripts and agents.
- Commands that return collections or records support `--json` where applicable.
- Long-running generation and workflow commands expose wait/no-wait behavior and
  stable identifiers.

### Authentication

- `gf login` opens the deployment's browser authorization page and offers sign-in
  or account creation before returning through the existing PKCE callback.
- `gf signup` is a discoverability alias that selects account creation in the same
  PKCE flow; it does not create a parallel credential protocol.
- `/login` and `/signup` invoke those same flows from the TUI.
- API-key paste remains available for self-hosted and headless use.

### Commands

```text
gf balance
gf credits buy [credits]
gf credits packs
gf credits history

gf brand
gf brand list
gf brand show <id-or-slug>
gf brand use <id-or-slug>

gf workflow list
gf workflow show <id-or-key>
gf workflow run <id-or-key>
gf workflow runs
gf workflow status <execution-id>

gf gen image <prompt>
gf gen video <prompt>
gf gen article <prompt>

gf asset list
gf asset show <id>
gf asset download <id> [path]
gf job status <id>
```

Existing `brands`, `generate`, `library`, and `status` spellings remain compatible
aliases during this release. `gf` and `genfeed` remain the only executable names;
`gen` is a generation subcommand alias, not a new binary.

### TUI commands

```text
/help  /login  /signup  /logout  /whoami
/new  /resume  /threads  /model
/balance  /credits  /credits buy
/brand  /brand use  /workflows  /workflow run
/image  /video  /article  /jobs  /assets
/clear  /exit
```

Plain text remains an agent turn. Slash commands are interactive controls or
precise product shortcuts and are never the documented shell syntax.

### Credit purchase

- Credit quantities use the canonical pricing package and server-side bounds.
- The server owns the Stripe PAYG price identifier and resolves the authenticated
  user's canonical email and organization billing account.
- The CLI receives only a hosted Checkout URL, opens it in the browser when
  possible, prints it for headless environments, and can observe the balance
  after payment.
- Self-hosted deployments without managed billing expose a clear unavailable
  response and a configurable billing-page fallback.
- Webhooks remain the only authority that grants purchased credits.

## Key Decisions

- Use one typed terminal-operation layer below Commander and Ink rather than
  calling command handlers from the TUI.
- Use Ink with the repository's React version for accessible terminal rendering,
  input, resize, and testability.
- Keep generation as the short verb namespace (`gf gen image`) while managed
  resources use noun/action grammar (`gf workflow run`).
- Keep `gf balance` as the fastest read path; `credits` owns purchase, packs, and
  ledger history.
- Preserve old command names as aliases so the published CLI does not break
  scripts in a minor release.
- Keep the CLI on the reviewed product-action surface; OpenAPI endpoint count is
  not a coverage goal.

## Edge Cases and Failure Modes

- A non-TTY invocation without a command never enters interactive mode.
- Browser launch failure leaves the authorization or Checkout URL visible.
- Login state and PKCE state are validated; timeouts close the callback listener.
- Signup returns through the same state-bound PKCE exchange as login.
- Missing organization or brand scope produces an actionable command and TUI
  recovery state.
- Unknown or ambiguous brand/workflow references fail without selecting one.
- Checkout rejects quantities outside canonical bounds and never accepts a
  client-provided Stripe price identifier.
- Checkout creation resolves API-key identities from canonical database users
  even when session-only email arrays are absent.
- Generation disconnects retain the job identifier and provide a status command.
- Workflow retries never create a second execution implicitly.
- TUI command failures render an error and keep the session usable.

## Acceptance Criteria

- WHEN `gf` runs with an interactive stdin and stdout THE SYSTEM SHALL launch the
  terminal workspace with authentication, scope, credit, thread, and input state.
- WHEN `gf` runs without a TTY and without a command THE SYSTEM SHALL print help
  and exit without awaiting input.
- WHEN an unauthenticated user runs `gf login` or `gf signup` THE SYSTEM SHALL
  complete the same state-bound PKCE flow after sign-in or account creation.
- WHEN an authenticated user runs `gf balance` THE SYSTEM SHALL print the active
  organization's current Genfeed credit balance and support JSON output.
- WHEN an authorized user runs `gf credits buy` THE SYSTEM SHALL validate a
  canonical credit quantity, create a hosted Checkout session without exposing a
  Stripe price identifier, and print the Checkout URL even if no browser opens.
- WHEN Stripe confirms a completed PAYG Checkout THE SYSTEM SHALL grant credits
  through the existing idempotent webhook ledger and not from CLI polling.
- WHEN a user lists, shows, or selects a brand THE SYSTEM SHALL resolve it inside
  the active organization and persist only the selected canonical brand id.
- WHEN a user lists, shows, runs, or inspects a workflow THE SYSTEM SHALL use the
  canonical workflow and immutable execution endpoints and return stable ids.
- WHEN a user invokes `gf gen image`, `gf gen video`, or `gf gen article` THE
  SYSTEM SHALL use the existing generation services and preserve wait, JSON, and
  output-file behavior.
- WHEN a user enters a supported slash command THE SYSTEM SHALL invoke the same
  terminal operation used by the equivalent non-interactive command.
- IF a TUI operation fails THEN THE SYSTEM SHALL render an actionable error and
  SHALL keep the session available for the next command.
- THE SYSTEM SHALL preserve the existing `brands`, `generate`, `library`, and
  `status` command spellings as compatibility aliases.
- THE SYSTEM SHALL document installation, authentication, scripting, TUI slash
  commands, credits, generation, brands, workflows, assets, and headless use.

## Test Plan

- Pure command parsing tests cover canonical commands, aliases, flags, JSON, TTY
  dispatch, and exit behavior.
- Terminal-operation unit tests cover auth requirements, reference resolution,
  checkout validation, and API request contracts.
- Ink component tests cover input editing, slash routing, command failures,
  streaming output, and persistent session state.
- API controller tests cover CLI-safe PAYG Checkout, DB email fallback,
  organization billing authorization, bounds, and unavailable configuration.
- Existing webhook tests remain the proof that Checkout completion grants credits
  idempotently.
- Integration tests exercise login, balance, brand selection, generation start,
  workflow start/status, asset listing, and Checkout URL creation with provider
  calls mocked where they spend money.
- Required compiler, test, and build evidence runs on the Mac Studio or CI; this
  MacBook performs only changed-file formatting/lint checks.
