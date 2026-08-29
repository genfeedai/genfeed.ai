---
name: Terminal content workspace decisions
description: Architecture and product decisions for the shared Genfeed CLI and TUI
type: project
status: active
last_verified: 2026-08-28
topics: [cli, tui, auth, credits, generation, workflows]
---

# Terminal Content Workspace Decisions

## Optimization Target

Make the shortest interactive path pleasant without weakening the deterministic,
composable CLI surface used by scripts and agents. A capability is complete only
when authentication, scope, API behavior, terminal rendering, failure recovery,
tests, and documentation agree.

## Approaches Considered

1. **Extend the readline agent shell.** This has the smallest diff and preserves
   current streaming, but command behavior would remain embedded in renderers and
   the result would still lack a structured terminal layout.
2. **Build an independent full-screen TUI.** This produces the richest demo
   quickly, but duplicates authentication, generation, workflow, and billing
   behavior and creates two clients that drift.
3. **Shared terminal operations with Commander and Ink adapters (chosen).** This
   costs more initially but gives scripts, agents, and the TUI one tested behavior
   for every exposed product action.

## Command Grammar

- `gf` is the short executable and `genfeed` is the explicit executable.
- Slash commands exist only inside the TUI.
- Managed resources use noun/action grammar: `gf brand list`, `gf workflow run`.
- Generation keeps a compact action family: `gf gen image`; `generate` is a
  compatibility alias.
- `gf balance` is the primary read command. `gf credits` owns purchasing and
  ledger operations. `buy` is explicit about an external financial action;
  `add` remains reserved for administrative grants.
- Singular namespaces are canonical. Existing plural namespaces remain aliases.

## Authentication

Login and signup are presentation choices around one PKCE protocol. `gf signup`
opens the existing authorization flow with account creation selected, then uses
the same localhost callback, state validation, code verifier, token exchange, and
credential store as `gf login`.

## Billing

The terminal never handles payment credentials and never receives a Stripe price
id. A scoped API operation accepts a credit quantity, resolves the server-owned
PAYG price, verifies billing-account authority, and returns hosted Checkout. The
existing Stripe webhook remains the only credit-grant authority. Crypto stays out
of this implementation because the current Stripe business is ineligible and no
second provider has been approved.

## TUI Boundary

Ink owns terminal rendering and input mechanics. Genfeed-owned operation modules
own product behavior. The TUI renders typed results and errors but does not import
Commander command objects or scrape stdout. Non-TTY execution never mounts Ink.

## Compatibility

The published CLI is already used externally. This release adds canonical names
without breaking `brands`, `generate`, `library`, `status`, `chat`, or existing
flags. Help leads with the new grammar and labels old spellings as aliases.

## External Action Boundary

The terminal exposes user-meaningful actions, not endpoint parity. It reuses the
same API and governed workflow paths as the web product. New terminal operations
do not create a second curated agent/MCP catalog or bypass mutation approval
policy.
