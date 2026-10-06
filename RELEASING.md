# Releasing Genfeed.ai

Use one tag family per surface. Do not reuse a single tag for unrelated release flows.

This repo is trunk-based. `master` is the single trunk.

- Contributors open PRs against `master`.
- Maintainers merge short-lived branches into `master` via PR.
- Production release automation should only run from commits that already landed on `master`.
- `staging` and `production` are deploy environments, not promotion branches.

## Version contract

Vocabulary is defined in [CONTEXT.md](CONTEXT.md) (Repo version, Changelog,
Upgrade note).

- **One repo version.** The semver in the root `package.json` is the version of
  the repository and of the Community bundle. Bump it in a normal PR, merge,
  then dispatch `Release` with the matching `v<version>` tag — the workflow
  fails closed on a mismatch. That tag names the GHCR image, the self-hosted
  bundle, and the GitHub release. `v1.0.0` marks Launch.
- **Independent surfaces.** `desktop-v*`, `mobile-v*`, and
  `extension-browser-v*` version independently, as do the published npm
  packages (`@genfeedai/cli`, `@genfeedai/create`) — each has its own
  `package.json` version bumped in a normal PR. Matching numbers across
  surfaces are a convenience, not a requirement.
- **`0.x` semantics.** Before `v1.0.0`, minor releases may contain breaking
  changes for self-hosters. Every such release carries an **Upgrade note**
  section at the top of the release body that names the breaking change, the
  Prisma migration(s) involved, and the manual step if any. From `v1.0.0`
  semver is strict: breaking changes only in a major.
- **No cadence.** Releases ship from `master` when the maintainer decides
  they are ready. There is no weekly/monthly schedule and no release train.
- **Changelog is generated, never hand-edited.** The `Release` workflow runs
  git-cliff with [`cliff.toml`](cliff.toml) over Conventional Commit subjects
  (which, under squash-only merge, are the PR titles). The section for the tag
  becomes the GitHub release body; the full `CHANGELOG.md` is attached to the
  release as an asset. Nothing is committed back to `master`, so the Releases
  page is the changelog. Write good PR titles; that is the changelog. Preview
  locally with `bunx git-cliff --unreleased --tag vX.Y.Z --strip header`.
- **Security fixes** ship as a normal release; the advisory is published with
  it (see [SECURITY.md](SECURITY.md)).

## Main Production Release

Use this when shipping the hosted product and self-hosted image.

1. Merge the intended changes to `master` via PR.
2. Bump `version` in the root `package.json` to `1.2.3` in a PR and merge it.
3. Open GitHub Actions → `Release`, choose `master`, and enter the matching
   stable semver tag `v1.2.3`.
4. Dispatch the workflow once. Do not create or publish the GitHub release
   separately with `gh release create` or the Releases UI.

The canonical workflow pins the selected `master` SHA and runs Full Suite once.
After that shared gate it ships both distribution lanes from the same commit:

- community: self-hosted image, public install assets, and anonymous install
  smoke
- SaaS: public workflows deploy the exact pinned commit through migration,
  boot checks, ECS rollout, Vercel deployment and production smoke checks.

The workflow creates a draft release before the gates so a failed attempt can
reuse the same version safely. It publishes the GitHub release and advances
`latest` only after both community and SaaS succeed. A tag or draft release
alone is not evidence that production shipped.

If a failed canonical `Release` already deployed hosted SaaS and pushed the
versioned Community image, recover that same version through `Release` on
`master`: enter the unchanged tag and the failed run's numeric ID in
`recovery_run_id`. Do not rerun the historical workflow and do not bump the
version. Recovery fails closed unless GitHub proves that the prior run belongs
to this repository, ran the canonical workflow from `master`, matches the
requested tag and unpublished draft, and used the draft's exact historical
SHA. The Git tag must still be absent.

Two shapes qualify. They do not substitute for each other, and deleting
successful assets to force the older shape is not a recovery path.

Attachment failure (`v0.1.66`): the prior Full Suite, hosted SaaS deploy and
smoke, and versioned image jobs are green. Every bundle build, smoke, and
image-verification step succeeded, only the draft attachment step failed, and
promotion, npm, and publication were skipped. The draft still has exactly one
non-empty `CHANGELOG.md` with its historical asset ID and digest, and zero
install tarball or checksum assets. Recovery keeps that title and those notes,
checks out the historical SHA, skips the proved-green Full Suite and SaaS
gates, and reuses the existing versioned image without pushing over it. It
anonymously pulls that image, verifies its OCI version, revision, and digest,
rebuilds and smokes the missing install bundle, and attaches the new assets.
The upload refuses to overwrite existing versioned assets, then revalidates
the new tarball and checksum together with the unchanged changelog.

npm source no-op (unpublished `v0.2.3`): this second mode requires a trusted
reviewed controller qualification. The controller currently qualifies only run
`37484284049`, tag `v0.2.3`, and source
`1c228e1a2bce02234a8f317d4f8f32659c2d3cb9`. An unknown run fails closed until a
reviewed qualification record exists. The prior Full Suite, hosted SaaS
deploy, smoke, and server promotion, Community image build, anonymous pull,
install-bundle build, smoke, attachment, and immutable asset-identity checks
are already green. The only failed job is the npm plan, and only because
master advanced after that release was dispatched. npm preflight, npm
publication, Community channel promotion, and GitHub publication were skipped.
The draft still has exactly three uploaded assets: historical `CHANGELOG.md`,
`genfeed-selfhosted.tar.gz`, and `genfeed-selfhosted.tar.gz.sha256`, each at
its original ID, size, digest, and timestamp. This path does not rebuild the
bundle, upload or replace assets, push another versioned image, or redeploy
SaaS. It re-downloads those assets by ID, checks their bytes, checksum, and
`release.json` tag and image, then anonymously resolves the existing Community
tag. That manifest digest must equal the reviewed historical image digest
before any image output or channel promotion. A replacement image fails even
when its version and revision labels match. The read-only check freezes the
reviewed digest and does not adopt whatever the tag currently displays. Any
other npm error, a changed draft, a missing, extra, or duplicate asset, an
existing tag, a SHA that is no longer on `master`, or a run without that
reviewed qualification fails closed.

Channel promotion uses the verified image digest. For an npm source no-op,
that digest is the reviewed historical digest frozen by the read-only check.
Community `latest` and major.minor promotion still runs for `v0.2.3`, because
the failed release skipped it, and only after the registry-drift plan succeeds
and is empty.
npm publication and making the draft public stay behind that same empty plan
for both shapes. A normal release requires the pinned SHA to equal
current `master`; a validated historical recovery requires the recovered SHA to
remain an ancestor of current `master`. A validated historical recovery may
continue only when the registry-drift plan is empty; if any enrolled package
would publish, the recovery fails closed and a new release must run from
current `master`. This lets the `v0.1.66` recovery preserve truthful npm
provenance because its verified plan is a no-op, without creating a generic
historical publication path.

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

For an unconsumed failed release whose tag is behind `master` and has no image,
assets, or deployment, first reverify that none of those outputs exist, then
delete and re-cut the same release tag at the fixed `master` commit. This path
does not apply once either distribution lane consumed the historical SHA; use
the explicit `recovery_run_id` path above instead. Do not burn a new version for
a release that never fully shipped.

The Community container package `genfeed.ai` must be public before the anonymous
artifact smoke can pass. For the initial private-to-public migration, let the
workflow push the corrected exact image first, change that package to public,
then rerun only the failed artifact job; this avoids exposing the stale image.
Do not change the visibility of the internal `genfeed.ai/server` package. Hosted
SaaS copies `SERVER_IMAGE_REPOSITORY` (that private server package) into ECR, so
the deploy engine authenticates to GHCR with `GITHUB_TOKEN` before inspect or
`imagetools create`. The public Community image is a different package.

`packages/create` and every other enrolled public package are published by the
release itself, from the same pinned SHA — see the npm section below. No manual
follow-up dispatch is required.

Hosted SaaS deploy jobs, OpenTofu, and ECS helper scripts live in this
public repository so GitHub bills free public Actions minutes. Do not
clone `console.genfeed.ai` and do not dispatch its workflow to ship
production. Fleet and LoRA stay in console.

`Release` and the standalone `Deploy hosted SaaS` workflow run in this public
repository: GHCR→ECR, migrate, boot-smoke, ECS roll, Vercel, smoke. Production
deployment requires explicit approval of the exact reviewed SHA through the
cut-release process. The standalone deploy is not the normal release entry point.
The pinned SHA must remain reachable from public `master`. Marketplace releases
run independently in their own repository.
Hosted SaaS reusable-workflow
calls map only the declared deploy secrets (`VERCEL_TOKEN`,
`NEXT_PUBLIC_POSTHOG_KEY`, optional `TURBO_TOKEN`) and never inherit the
full secret set.
The engine deploys Vercel frontends after the API rollout and smokes the
live estate. A missing, timed-out, cancelled, or failed SaaS deploy leaves
the public release as a draft and prevents `latest` and npm promotion.

Hosted SaaS deployment does not use `CONSOLE_DEPLOY_TOKEN`. Site
identity is **not** in the repo. Put it on the `production` GitHub
environment and the workflow fails closed if a required value is empty.

Required environment variables:

- `DOMAIN`, `PROJECT`, `VPC_ID`, `PUBLIC_SUBNET_IDS`, `NAT_PUBLIC_SUBNET_ID`
- `RDS_INSTANCE_ID`, `SSM_PATH`, `CDN_BUCKET`
- `IGNORED_SSM_SECRET_NAMES`: JSON array of excluded SSM names; set `[]` explicitly if none. Preserve your current exclusions when configuring this value.
- `TF_STATE_BUCKET`, `TF_STATE_KEY`
- `SERVER_IMAGE_REPOSITORY`, `ECR_REPOSITORY_NAME`
- `HOSTED_OWNER_EMAIL`, `HOSTED_ORGANIZATION_LABEL`
- `APP_HOST`, `WEB_HOST`
- `VERCEL_ORG_ID`, `VERCEL_PROJECT_APP`, `VERCEL_PROJECT_WEB`

Optional: `DOCS_HOST`, `VERCEL_PROJECT_DOCS`. Empty docs project id skips
that frontend. Marketplace is a separate repository and is not deployed
from this monorepo.

Required repository variables: `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`.
Required secrets: `VERCEL_TOKEN`, `NEXT_PUBLIC_POSTHOG_KEY`.

A fork can deploy its own hosted SaaS by filling that environment. There
are no `genfeed.ai` / `genfeed-data` / VPC defaults in the apply path.

`CONSOLE_DEPLOY_TOKEN` remains in use by CI issue/project reporters; retiring
private deployment does not retire that reporting credential.

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

Keep this lane available while frontend development takes priority. Manual
`Mobile - Validate and EAS Build` runs default to validation and unit tests;
leave `build=false` to avoid starting remote EAS jobs.

Before a remote build, link the Expo project, set the repository variable
`EXPO_PROJECT_ID` to its UUID, and configure the `EXPO_TOKEN` secret. The workflow
writes that linkage into the CI copy of `app.json`. The native identifiers live
in `app.json`; signing credentials must already be configured in EAS for
non-interactive device/store builds. No App Store or Play Store submission is
configured yet.

For a release, update both the mobile package and Expo app versions, then push
`mobile-v<version>` from the approved `master` commit. Tags build both platforms
with the production profile. Manual remote builds default to the preview profile
and let you choose a platform. This lane still needs a successful signed EAS
build before it can be considered release-ready.

## Browser Extension Release

Manual `Browser Extension - Package and Submit` runs default to tests, build,
and a downloadable Chrome ZIP; leave `submit=false` while developing the frontend.
The build uses Turbo so workspace dependencies build before Plasmo packages the
extension. This lane still needs a successful packaging and store validation run
before it can be considered release-ready.

Before submission, configure `EXTENSION_SUBMIT_KEYS` as Chrome-only Plasmo BPP
JSON containing `chrome.clientId`, `clientSecret`, `refreshToken`, and `extId`.
The extension ID is the 32-letter Chrome Web Store ID. Do not put credentials in
source files. Obtain the OAuth credentials and create the store listing first.

Update the browser package version, then push `extension-browser-v<version>`
from the approved `master` commit. The tag must match the package version and
triggers store submission after tests and packaging succeed. Manual submission
requires selecting that same release tag and setting `submit=true`; branch runs
only package the extension.

## IDE Extension Packaging

`Package IDE Extension` (`package-ide-extension.yml`) remains manual. It runs
lint, type checks, unit/E2E tests, build, and VSIX packaging, then uploads the
VSIX for local installation. Marketplace publication is not configured.

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
