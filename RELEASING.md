# Releasing Genfeed.ai

Use one tag family per surface. Do not reuse a single tag for unrelated release flows.

This repo is trunk-based. `master` is the single trunk.

- Contributors open PRs against `master`.
- Maintainers merge short-lived branches into `master` via PR.
- Production release automation should only run from commits that already landed on `master`.
- `staging` and `production` are deploy environments, not promotion branches.

## Main Production Release

Use this when shipping the hosted product and self-hosted image.

1. Merge the intended changes to `master` via PR.
2. Create a GitHub release from the `master` commit you want to ship.
3. Use a semver tag such as `v1.2.3`.

That release triggers:

- `.github/workflows/docker-publish.yml` for the self-hosted image and public
  install assets

The self-hosted release contract is version-bound:

- GitHub tag `v1.2.3`
- GHCR image `ghcr.io/genfeedai/genfeed.ai:1.2.3`
- release assets `genfeed-selfhosted.tar.gz` and
  `genfeed-selfhosted.tar.gz.sha256`
- bundle manifest `releaseTag=v1.2.3` and the exact GHCR image above

The publish workflow advances `latest`, builds the checksummed bundle, exercises
the built `@genfeedai/create` CLI against it, anonymously pulls the exact image,
validates OCI version/revision labels, and only then attaches the assets. The
nightly self-hosted E2E downloads that exact public bundle and does not log in to
GHCR.

If a published release is missing assets after a transient failure, dispatch
`Docker Publish (Self-Hosted)` from `master` with `release_tag=v1.2.3`. Recovery
is fail-closed: the tag must exist and point exactly at current `master`; the
workflow rebuilds the exact image and reruns the public smoke before attaching
assets. Never use recovery to overwrite a version that users already consumed.

For an unconsumed failed release whose tag is behind `master` (including the
assetless v0.5.0 incident), first reverify that it has no image/assets/deployment,
then delete and re-cut the same release tag at the fixed `master` commit. Do not
burn a new version for a release that never shipped.

The Community container package `genfeed.ai` must be public before the anonymous
artifact smoke can pass. For the initial private-to-public migration, let the
workflow push the corrected exact image first, change that package to public,
then rerun only the failed artifact job; this avoids exposing the stale image.
Do not change the visibility of the internal `genfeed.ai/server` package.

After the release is green, publish `packages/create` through the package
publishing workflow so npm users receive the installer tested by this contract.
Use `[{"path":"packages/create","version":"0.2.0"}]` for `packages_json` — the
exact version already merged to `master`, never a `bump` request (see the npm
section below) — and set `dry_run=false` only for the approved publish run.

Production backend deploys are handled separately through
`.github/workflows/deploy-ecs.yml`, dispatched from `master` and gated by the
GitHub `production` environment. The legacy `Deploy Production` workflow was
removed after the Fargate cutover.

## Desktop Release

Desktop releases are shipped separately from the main production release.

1. Start from the `master` commit you want to ship.
2. Create and push a desktop tag such as `desktop-v1.2.3`.

```bash
git checkout master
git pull --ff-only origin master
git tag desktop-v1.2.3
git push origin desktop-v1.2.3
```

That tag triggers `.github/workflows/desktop-release.yml`, which now:

- requires the Apple signing secrets up front
- builds the macOS artifact
- uploads the artifact to the workflow run
- creates or updates the GitHub release for `desktop-v1.2.3` and attaches the artifact automatically

Required GitHub Actions variables:

- `APPLE_API_ISSUER_ID`
- `APPLE_API_KEY_ID`

Required GitHub Actions secrets:

- `APPLE_API_PRIVATE_KEY_P8_BASE64`
- `DEVELOPER_ID_P12_BASE64`
- `DEVELOPER_ID_P12_PASSWORD`

## Mobile Release

Mobile releases are shipped separately from the main production release.

1. Start from the `master` commit you want to ship.
2. Create and push a mobile tag such as `mobile-v1.2.3`.

```bash
git checkout master
git pull --ff-only origin master
git tag mobile-v1.2.3
git push origin mobile-v1.2.3
```

That tag triggers the Expo/EAS mobile build workflow.

## Browser Extension Release

Browser extension releases are also shipped separately.

1. Start from the `master` commit you want to ship.
2. Create and push a browser extension tag such as `extension-browser-v1.2.3`.

```bash
git checkout master
git pull --ff-only origin master
git tag extension-browser-v1.2.3
git push origin extension-browser-v1.2.3
```

That tag triggers `.github/workflows/browser-extension-submit.yml`, which builds the extension, uploads the packaged zip artifact, and submits it to the Chrome Web Store.

## Shipping All Surfaces For One Version

If a release needs to cover the hosted product, desktop app, and browser extension, cut all tags from the same `master` commit:

1. Create the main GitHub release tag, for example `v1.2.3`.
2. Push `desktop-v1.2.3`.
3. Push `mobile-v1.2.3`.
4. Push `extension-browser-v1.2.3`.

The version numbers should match, but the workflows are intentionally separate so each surface can be shipped independently when needed.

## Public npm Packages

npm versions are release state and follow the same trunk gate as code:

1. Update every package version in a normal PR to `master`. Include all
   unpublished workspace dependencies needed by the release.
2. From the `master` Actions page, run `Publish Packages` with `dry_run=true`
   and exact merged versions, for example:

   ```json
   [{"path":"packages/enums","version":"2.3.3"},{"path":"packages/constants","version":"2.2.10"}]
   ```

3. Inspect the preflight artifact and summary. The workflow builds from clean
   outputs, orders workspace dependencies, packs with Bun, validates the
   resolved tarball, injects the matching complete license text, and runs
   `npm publish --dry-run` before registry access is granted. An abbreviated
   root AGPL notice fails preflight instead of producing an incomplete package.
4. Rerun the same input with `dry_run=false`. The publish job uploads only the
   preflighted tarballs and never commits or pushes to `master`. If npm fails
   partway through, rerun the exact release: matching registry tarballs are
   verified and skipped before pending packages continue.

Do not pass `bump` requests to the workflow and do not publish a workspace
directory with npm. Bun resolves `workspace:*` while creating the immutable
tarball; npm 11.5.1 or newer uploads that tarball with trusted-publisher OIDC
and provenance.

An npm owner must configure each existing `@genfeedai/*` package with this
trusted publisher before its first workflow release:

- organization: `genfeedai`
- repository: `genfeed.ai`
- workflow: `publish-packages.yml`
- environment: unset unless the workflow is updated to use one

Package names that do not yet exist on npm (`api-types`, `auth-client`,
`harness`, `pricing`, and `queue-contracts` as of July 2026) require one
owner-authenticated bootstrap publication before npm allows trusted-publisher
configuration. Bootstrap from a preflight tarball; never bypass the version PR
or publish directly from a workspace directory.
