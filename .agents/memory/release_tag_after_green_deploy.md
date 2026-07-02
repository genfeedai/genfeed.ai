# Release tags only after a green deploy

- **Rule:** Never cut a version tag/GitHub release before the production deploy gate has passed on that exact sha. Sequence: dispatch `deploy-ecs` on master → full QA gate green → ECS rollout succeeds → THEN `gh release create vX.Y.Z --target master`.
- **Why:** A tag cut before the gate can end up labeling nothing (cloud deploy failed, self-hosted publish failed its pre-publish gate) — burning version numbers on failed deploys and making the version history lie. v0.4.3 was cut pre-gate, failed twice, and had to be deleted (nothing had consumed it).
- **Failed-deploy handling:** if a deploy fails after a tag was mistakenly cut and NOTHING consumed the tag (no self-hosted image published, no ECS rollout), delete the release + tag and re-cut the SAME version from the fixed sha once green. Do not skip to the next patch number.
- **Self-hosted alignment:** cutting the release after the cloud deploy is green means the release-triggered self-hosted publish runs its gate on the same proven sha — cloud and self-hosted ship identical, tested code.

last_verified: 2026-07-02
