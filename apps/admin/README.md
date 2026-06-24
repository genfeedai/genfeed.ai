# Admin App Release Guard

`apps/admin` was removed in commit `eef2dfe1fedda73ea14b1525200e8a9729b28c42`.
`admin.genfeed.ai` is the open-source Genfeed admin surface for people managing
their own Genfeed instance.

This directory intentionally contains only `vercel.json` while the
`admin.genfeed.ai` Vercel project still points at the removed `apps/admin` root.
The guard makes that Vercel project read `git.deploymentEnabled = false` and
stops it from creating production deployments from ordinary monorepo `master`
merges.

Remove this guard only after the open-source admin surface is deliberately
rewired to a real monorepo target and that target is deployed through the
API-first release workflow.
