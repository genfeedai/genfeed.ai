# Supply-chain compromise runbook

Use this when a dependency, GitHub Action, build tool, or CI runner that Genfeed
uses is reported compromised, or when a release of ours may have shipped
something we did not write. Prevention lives in
[CI/CD enforcement](../ci-cd-enforcement.md); this page is what to do after it
failed.

## Decide the blast radius first (15 minutes)

1. Name the package or Action and the bad versions or SHAs.
2. Search the lockfile and workflows:
   - `grep -n '<package>@' bun.lock` for the resolved versions;
   - `grep -rn '<owner>/<action>' .github` for Action usage.
3. Find the first merge to `master` that introduced the bad version
   (`git log -S'<package>@<version>' -- bun.lock`) and every release cut since
   (`gh release list`). Anything that ran `bun install` or the Action after that
   point is exposed: PR CI, nightly suites, release, hosted deploy, desktop and
   mobile builds.
4. Fork PRs never receive secrets, so only jobs on `master`, tags, schedules and
   same-repository branches count as exposed.

## Contain

- Stop shipping. Cancel in-flight `Release` and `Deploy hosted SaaS` runs and do
  not cut a release until the rebuild below is done.
- Remove or pin back the dependency in a PR (`bun.lock` conflicts: `rm bun.lock
  && bun install`). The 3-hour `minimumReleaseAge` in `bunfig.toml` applies to
  the regenerated lockfile.
- If a self-hosted or hosted release already contains the bad version, run
  **Rollback hosted SaaS** ([rollback](rollback.md)) to the last release built
  before the introduction, then ship a forward fix as a new patch release.
- A bad npm release of our own: `npm deprecate` the version, publish a fixed
  patch, and open a GitHub security advisory. Do not unpublish.

## Rotate secrets

Rotate everything the exposed jobs could read, in this order. Rotate first,
investigate second.

| Where it lives | What | How |
| --- | --- | --- |
| GitHub repository and `production` environment secrets | `BETTER_AUTH_SECRET`, `SENTRY_AUTH_TOKEN`, `VERCEL_TOKEN`, `TURBO_TOKEN`, `EXPO_TOKEN`, `HOMEBREW_TAP_TOKEN`, `GENFEED_BOT_PRIVATE_KEY` and client id, `EXTENSION_SUBMIT_KEYS`, the `CONTENT_HARNESS_BUNDLE_*` and `CONTENT_EVAL_*` keys, release and QA webhook URLs and auth, Apple signing (`DEVELOPER_ID_P12_*`, `APPLE_API_PRIVATE_KEY_P8_BASE64`), `GITLEAKS_LICENSE` | Issue a new value at the provider, update the GitHub secret, revoke the old value. Regenerate the GitHub App private key and delete the old one. |
| AWS SSM Parameter Store, `/genfeed/production/*` | Runtime secrets injected into the api, files and workers task definitions | Rotate at the upstream provider, write the new value to SSM, then redeploy (a new release) so tasks pick it up. Rotate the database credential and the Better Auth secret even if you only suspect exposure: the latter signs sessions, so rotating it signs everyone out. |
| AWS deploy identity | Deploys use GitHub OIDC (`AWS_DEPLOY_ROLE_ARN`), so there are no long-lived AWS keys in CI | Review CloudTrail for `AssumeRoleWithWebIdentity` by this repository during the exposure window. Tighten the role trust policy if anything looks off. |
| npm | Publishing uses OIDC trusted publishing with provenance, so there is no npm token | Check that the trusted-publisher binding is still limited to this repository and workflow, and review recently published `@genfeedai/*` versions. |
| Provider keys users store | Per-organization provider credentials in the database | Only if the hosted runtime itself was exposed: notify affected organizations and have them rotate. |

Confirm each rotation by checking the old value no longer works, not just that
the new one was set.

## Rebuild from a clean state

1. Branch from `master` with the dependency removed or pinned.
2. Let CI run on the PR. Do not reuse caches: the Bun download cache is off by
   default, and the Turbo remote cache is keyed by content hash, so purge it for
   the affected packages (`TURBO_TOKEN` was rotated above) before the release.
3. Cut a new patch release through `Release` (never re-cut a tag). It rebuilds
   the server image from the exact SHA, so the images, the Community bundle and
   the desktop installers are all new artifacts.
4. Deploy through the normal path and run the post-deploy smoke. Retire the old
   container images and GitHub release assets that contain the bad version.
5. Verify the new artifacts: check the image digest the deploy used, the release
   checksums, and the npm provenance on the new `@genfeedai/*` versions.

## Afterwards

- Open an issue with the timeline: first exposure, detection, rotation done,
  rebuild shipped.
- If the entry point was a dependency or Action we did not pin tightly enough,
  fix the gap that let it in rather than adding a one-off check.
- Add the advisory to the PR that fixes it; the dependency-review check will
  keep the bad version out of future lockfile changes.
