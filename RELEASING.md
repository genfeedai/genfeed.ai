# Releasing Genfeed.ai

This repo promotes changes through `develop` -> `staging` -> `master`.

- Contributors open PRs against `develop`.
- Maintainers promote `develop` to `staging`, then `staging` to `master`.
- Production release automation should only run from commits that already landed on `master`.

## Main Production Release

Use this when shipping the hosted product and self-hosted image.

1. Merge the intended changes to `develop`.
2. Promote `develop` -> `staging` -> `master` via PR.
3. Create a GitHub release from the `master` commit you want to ship.
4. Use a semver tag such as `v1.2.3`.

That release triggers:

- `.github/workflows/deploy-production.yml` for the backend and Vercel surfaces
- `.github/workflows/docker-publish.yml` for the self-hosted image

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
- attaches the artifact to the GitHub release for `desktop-v1.2.3`

Required GitHub Actions secrets:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `APPLE_SIGNING_CERTIFICATE_BASE64`
- `APPLE_SIGNING_CERTIFICATE_PASSWORD`

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
3. Push `extension-browser-v1.2.3`.

The version numbers should match, but the workflows are intentionally separate so each surface can be shipped independently when needed.
