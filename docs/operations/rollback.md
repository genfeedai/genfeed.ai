# Rolling back the hosted SaaS

Use this when a release is live and broken, and a forward fix will take longer
than restoring the last good release.

## One-click rollback

Actions → **Rollback hosted SaaS** → Run workflow on `master`.

- `target_tag`: the stable release to restore (`vX.Y.Z`). Leave it empty to
  restore the stable release published just before the latest one.
- `reason`: required; it appears in the run title and summary.

The workflow resolves the tag to its commit and calls **Deploy hosted SaaS**
for that commit, so the API, workers, and the app, website, and docs frontends
all return to the same release together. It then runs the same live
post-deploy smoke as a release.

## What it does not do

- It does not touch the database. The deploy lane takes an RDS snapshot before
  migrating, but a rollback skips no migration logic: it runs migrations for the
  older commit (normally none) and refuses a client that cannot read the live
  schema (see `docs/migration-deploy-safety.md`). After a contract migration,
  a rollback past it is blocked on purpose; ship a forward fix instead.
- It does not unpublish the GitHub release or move `latest`. After a rollback,
  mark the bad release as a pre-release by hand and open an issue.
- It does not roll back self-hosted installs or npm packages.

## After a rollback

1. Confirm the post-deploy smoke job is green.
2. Open an issue for the bad release with the failing symptom and the SHA.
3. Fix on a new branch from `master`; the next release must be a new patch
   version, never a re-cut of the rolled-back tag.
