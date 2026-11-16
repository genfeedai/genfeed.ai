# Publishing the shared packages

`@genfeedai/styles`, `@genfeedai/ui`, `@genfeedai/helpers` and `@genfeedai/contracts` publish to
npm from their own workflow, `.github/workflows/publish-shared-packages.yml`, without cutting a
release. console.genfeed.ai and marketplace.genfeed.ai install them through `deps:update`.

The CLI and the self-hosted scaffolder (`@genfeedai/cli`, `@genfeedai/create`) still publish from
`release.yml` with every stable release.

## Why two workflows

npm trusted publishing matches the calling workflow's filename, and a package has exactly one
trusted publisher. `scripts/npm-release-enrollment.json` therefore puts every public package in
exactly one lane: `enrolled` (the release lane) or `dedicated` (this workflow). `bun run
check:npm-release` fails when a package is in two lanes, in none, or names a workflow file that
does not exist.

## One-time setup (a maintainer, on npmjs.com)

The four names exist as `0.0.1` placeholders. For each of `@genfeedai/styles`, `ui`, `helpers` and
`contracts`, open Settings, then Trusted publisher, and add GitHub Actions with:

- Organization or user: `genfeedai`
- Repository: `genfeed.ai`
- Workflow filename: `publish-shared-packages.yml`
- Environment: empty

Until this is done a real publish fails at the registry with an authorization error. A dry run
does not need it.

## Publish

1. Run **Publish Shared Packages** from `master` with `dry_run` left on. It plans from registry
   drift (every enrolled version the registry has not seen), builds and packs each tarball, and
   runs `npm publish --dry-run`. Nothing is written.
2. Read the plan in the run summary. Publishing is irreversible, so run it again with `dry_run`
   off only with the owner's go.
3. The publish job publishes dependency-first (`contracts`, `helpers`, `styles`, then `ui`) and
   can be re-run: versions already on npm are skipped.

To ship a change, bump the package's `version` in a normal pull request first. A version npm
already has is never published twice.
