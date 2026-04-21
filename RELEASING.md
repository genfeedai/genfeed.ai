# Releasing

Use one tag family per surface. Do not reuse a single tag for unrelated release flows.

- `vX.Y.Z`
  Create a GitHub Release from this semver tag for the main product release.
  Triggers production backend deploys and the self-hosted Docker publish workflow.

- `desktop-vX.Y.Z`
  Push this tag to build the macOS desktop app.
  The desktop workflow creates or updates the matching GitHub release and uploads the signed `.dmg` / `.zip` artifacts there.

- `mobile-vX.Y.Z`
  Push this tag to trigger the Expo/EAS mobile build workflow.

- `extension-browser-vX.Y.Z`
  Push this tag to build and submit the browser extension package.

Examples:

- `v1.12.0`
- `desktop-v1.12.0`
- `mobile-v1.12.0`
- `extension-browser-v1.12.0`
