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
2. Open GitHub Actions → `Release`, choose `master`, and enter a new stable
   semver tag such as `v1.2.3`.
3. Dispatch the workflow once. Do not create or publish the GitHub release
   separately with `gh release create` or the Releases UI.

The canonical workflow pins the selected `master` SHA and runs Full Suite once.
After that shared gate it ships both distribution lanes from the same commit:

- community: self-hosted image, public install assets, and anonymous install
  smoke
- SaaS: ECS migrations/services, all Vercel frontends, and production smoke

The workflow creates a draft release before the gates so a failed attempt can
reuse the same version safely. It publishes the GitHub release and advances
`latest` only after both community and SaaS succeed. A tag or draft release
alone is not evidence that production shipped.

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
`Publish Self-Hosted (manual recovery)` from `master` with
`release_tag=v1.2.3`. Recovery is fail-closed: the tag must exist and point
exactly at current `master`; the workflow rebuilds the exact image and reruns
the public smoke before attaching assets. Never use recovery to overwrite a
version that users already consumed.

For an unconsumed failed release whose tag is behind `master` (including the
assetless v0.5.0 incident), first reverify that it has no image/assets/deployment,
then delete and re-cut the same release tag at the fixed `master` commit. Do not
burn a new version for a release that never shipped.

The Community container package `genfeed.ai` must be public before the anonymous
artifact smoke can pass. For the initial private-to-public migration, let the
workflow push the corrected exact image first, change that package to public,
then rerun only the failed artifact job; this avoids exposing the stale image.
Do not change the visibility of the internal `genfeed.ai/server` package.

`packages/create` and every other enrolled public package are published by the
release itself, from the same pinned SHA — see the npm section below. No manual
follow-up dispatch is required.

Standalone production recovery/fallback deploys remain available through
`.github/workflows/deploy-ecs.yml`, dispatched from `master` and gated by the
GitHub `production` environment. Stable releases call the same reusable ECS
core after their shared release gate. The legacy `Deploy Production` workflow
was removed after the Fargate cutover.

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

1. Dispatch the canonical `Release` workflow with `v1.2.3`.
2. Push `desktop-v1.2.3`.
3. Push `mobile-v1.2.3`.
4. Push `extension-browser-v1.2.3`.

The version numbers should match, but the workflows are intentionally separate so each surface can be shipped independently when needed.

## Public npm Packages

**npm publishing is automatic. There is no separate npm release step.**

The canonical `Release` workflow calls `publish-packages.yml` after Community and
SaaS are green and before the GitHub release leaves draft. That lane compares
every enrolled package's `master` version against the registry and publishes
whatever npm has not seen. Bump a version in a normal PR and the next stable
release ships it — nobody has to remember a dispatch, which is how the registry
previously fell months behind `master`.

npm failure blocks the release: the GitHub release stays a draft, so a red npm
lane is visible instead of silent.

### The public surface is two packages

Only the installable products are public:

- `@genfeedai/cli` — the terminal client (`npm install -g @genfeedai/cli`).
  Its `dist` is bundled by `bun build`, so workspace packages are
  `devDependencies` and nothing internal leaks into the install graph.
- `@genfeedai/create` — the self-hosted scaffolder
  (`npx @genfeedai/create my-genfeed`).

Every other `packages/*` workspace is `private: true`. The pre-monorepo repos
published internals (`enums`, `helpers`, `ui`, …) to npm as a transport between
repos; `workspace:*` replaced that at the 2026-04 migration, and those names are
deprecated on the registry rather than kept current.

### Enrollment

`scripts/npm-release-enrollment.json` decides which public packages the lane
publishes. Every package under `packages/` with a public `publishConfig` must be
listed in exactly one of:

- `enrolled` — published automatically on every stable release.
- `excluded` — never published, with a written reason.

`bun run check:npm-release` enforces that on every PR. It also rejects an
enrolled package with a runtime `workspace:` dependency on an excluded or
private one, which would publish a manifest pointing at a version npm has never
seen: installable, broken on `require`. Making a package publishable is
therefore a deliberate release decision rather than a silent one.

### Trusted publisher configuration

npm matches the trusted publisher against the **caller** workflow filename and
allows one workflow per package, so the entry point is `release.yml`. An npm
owner must configure `@genfeedai/cli` and `@genfeedai/create` with:

- organization: `genfeedai`
- repository: `genfeed.ai`
- workflow: `release.yml`
- environment: unset unless the workflow is updated to use one

A package configured against another workflow filename fails authorization at
publish time.

### First publish of a new package name

npm OIDC cannot create a package name, so a name that does not yet exist on npm
needs one owner-authenticated bootstrap publication before it can be enrolled.
The release lane fails fast and names the packages when an enrolled name is
missing from the registry. Bootstrap from a preflight tarball, then configure the
trusted publisher; never bypass the version PR or publish a workspace directory
directly. Both currently enrolled names already exist on npm, so no bootstrap is
pending.

### Local preflight

```bash
bun run publish:package packages/cli
```

That builds from clean outputs, orders workspace dependencies, packs with Bun,
validates the resolved tarball, injects the matching complete license text, and
runs `npm publish --dry-run`. An abbreviated root AGPL notice fails preflight
instead of producing an incomplete package. It never writes to the registry —
publish credentials live in CI only.

To preflight a whole release without publishing, dispatch `Publish Packages`
from `master` with `dry_run=true`; leave `packages_json` empty to preflight
exactly the drift the next release would ship. A dispatched `dry_run=false` is
rejected, because that path is not the registered publisher.

Do not pass `bump` requests to the workflow. Bun resolves `workspace:*` while
creating the immutable tarball; npm 11.5.1 or newer uploads that tarball with
trusted-publisher OIDC and provenance. If npm fails partway through a release,
rerun it: matching registry tarballs are verified and skipped before pending
packages continue.
