packages: agent client hooks pages props services ui

Unify the generation waiting experience behind one status component and give
generated posts account-aware platform previews.

- `props`: new `./ui/feedback/generation-status.props` with the shared
  `GenerationStatusPhase` union and `GenerationStatusProps`. `isAnnounced`
  (default `true`) turns off the live region for historical lists.
- `agent`, `pages`, `services`, `client`, `hooks`: generation action cards,
  Studio generation, ingredient models, and the activities hook now carry
  persisted status, progress counts, elapsed start time, cancellation, and
  reconciliation fields. Consumers reading the previous shapes keep compiling;
  the added fields are optional.
- `ui`: `PlatformPreview`'s internal handle formatting no longer substitutes a
  placeholder handle. A target with no resolvable account handle renders none,
  so a real brand name is never paired with an invented `@handle`.

Existing preview wrappers remain as adapters. No API request, schema, or
configuration change.
