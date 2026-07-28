# One stable release ships community and SaaS from one SHA

- **Cut stable releases only through the manual `Release` GitHub Actions workflow on `master`.** Do not publish a GitHub release directly with `gh release create` or the Releases UI.
- The workflow pins one immutable master SHA, runs Full Suite once, publishes and smoke-tests the self-hosted community image/assets, deploys ECS and all Vercel frontends, runs production smoke checks, and only then makes the GitHub release public.
- A GitHub release or tag alone is never proof that SaaS deployed. Only a successful canonical `Release`, normal `Deploy ECS (production)`, or emergency fastlane workflow is a valid deployed-SHA marker.
- **A failed deploy never spawns a new version.** Fix on master and re-ship the same `vX.Y.Z`. Reuse or delete the unshipped draft/tag when nothing consumed it; never bump merely because a gate failed.
- **Version numbers mean both distribution lanes shipped.** If one lane partially consumed the version, preserve the tag, repair the failed lane at the same pinned SHA when safe, and record the degraded/recovery path.

last_verified: 2026-07-28
