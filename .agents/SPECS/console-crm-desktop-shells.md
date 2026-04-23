# Console/CRM Desktop Shells Spec

## Purpose

Provide native desktop app shells for the sibling `console` and `crm` repos while preserving the existing Next.js product surfaces and API contracts.

## Non-Goals

- Rewriting `console` or `crm` into desktop-native React apps in this pass
- Offline-first behavior or bundling the entire web stack into a single binary
- UI redesign beyond desktop shell affordances and optional desktop-mode hooks

## Interfaces

- Repo targets:
  - `../console/apps/desktop`
  - `../crm/apps/desktop`
- Runtime URL inputs:
  - Dev: local Next.js app URL
  - Packaged/prod shell: env-configured hosted app URL
- Shell features:
  - native window
  - secure preload boundary
  - external link handling
  - persisted window bounds
  - desktop-specific query flag (`surface=desktop`)

## Key Decisions

- Use Electron shells instead of inventing a second UI stack.
- Keep the existing Next.js apps as the product surface.
- Default dev shells to local frontend ports.
- Allow packaged shells to target hosted URLs through env configuration.

## Edge Cases and Failure Modes

- Hosted URL missing in packaged mode should fail loudly or fall back to documented localhost behavior.
- Unexpected navigations should stay within the allowed app origin or open externally.
- Desktop shells must not expose Node APIs to the renderer.

## Acceptance Criteria

- `console` has a runnable desktop shell package with build/dev scripts.
- `crm` has a runnable desktop shell package with build/dev scripts.
- Both shells launch their existing web apps in dev mode.
- Shell code compiles cleanly.

## Test Plan

- TypeScript compile for both desktop packages
- Script-level sanity check on desktop entrypoints
- Manual launch path can be exercised with local web dev servers
