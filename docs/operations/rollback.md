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

## Rehearse it first: dry run

Run the same workflow with `dry_run` ticked to prove a rollback would work
without deploying anything. It resolves the target exactly as a real rollback
does, finds that release's server image, and runs the migration compatibility
gate against the images serving production now. Its summary names the resolved
tag, commit and image digest, and says whether the gate passed.

- **Nothing is written.** Every step that deploys, migrates, snapshots, copies
  an image, stages or promotes a frontend, opens an issue, or promotes an image
  is skipped. The only steps that run read the registry, the OpenTofu state, and
  ECS metadata. `deploy-workflow-contract.test.ts` fails if a step that writes
  can run when `dry_run` is true.
- **It runs after every release.** At the end of a successful Release run, the
  **Rehearse hosted rollback** job dispatches a dry run against the stable
  release published just before it and adds the result and a link to the
  release summary. It runs as its own workflow run: a red rehearsal never fails
  or undoes the release. Treat a red rehearsal as "a rollback would not work
  today" and fix the cause before you need it.
- **A target the live schema cannot serve fails at the gate**, for example a
  release whose client still reads a column the live release has dropped. The
  error says the rollback dry run failed at the migration compatibility gate and
  names the incompatibility.
- It has its own concurrency groups, so it never queues behind or replaces a
  real deploy or rollback.

A rehearsal still signs in to AWS with the production deploy role, as the
production environment requires, but it only calls read APIs. A real rollback
drill in production is a production write and needs the owner's go.

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
