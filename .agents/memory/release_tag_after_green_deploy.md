# Failed deploys never burn a version number

- **Cutting the release before the gates is normal.** The release/tag may be created pre-gate (`gh release create vX.Y.Z --target master`); the release event triggers the gated self-hosted publish and the cloud deploy runs its own QA gate.
- **THE RULE: a failed deploy never spawns a new version.** If the gate/deploy fails, fix on master and re-ship the SAME vX.Y.Z — delete the unshipped release+tag and re-cut it at the fixed sha (safe when nothing consumed it: no self-hosted image published, no ECS rollout). NEVER bump to vX.Y.Z+1 because a deploy failed.
- **Version numbers mean "this shipped".** v0.4.3 was cut, failed its gates, got deleted, and is re-cut same-number from the fixed sha once green. Skipping to v0.4.4 would leave a phantom version and make the history lie.
- **Partial-consumption caveat:** if one side already consumed the tag (e.g. self-hosted image published but cloud failed — v0.4.2), do NOT delete that tag; ship the fix by re-cutting the same next version only if IT is unconsumed, and note the mismatch in the release notes.

last_verified: 2026-07-02
