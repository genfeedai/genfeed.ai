# Console/CRM Desktop Shells Decisions

## Shell Strategy

Use Electron shells for both repos.

## Why

- Both apps are already mature Next.js products.
- The fastest path to a real desktop deliverable is a native shell around the existing UI.
- This avoids splitting feature work across web and desktop implementations.

## Security Boundary

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- explicit navigation allowlist

## Delivery Model

- Dev mode targets local Next.js servers.
- Packaged mode targets env-configured hosted app URLs.

## Rejected Option

### Full desktop-native rewrite

Rejected because it would duplicate the product surface and block the Postgres migration work instead of shipping a usable desktop deliverable quickly.
