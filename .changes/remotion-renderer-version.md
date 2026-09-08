packages: contracts

Advance EDITOR_RENDERER_VERSION to remotion@4.0.522 to match the pinned app
player and Files renderer dependencies. Render fixtures already read this
canonical constant and require no separate version changes.

Deploy the contracts package and renderer together. Jobs carrying an older
renderer version remain rejected by the existing version check and must be
resubmitted using the current renderer contract.
