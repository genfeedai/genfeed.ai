packages: @genfeedai/agent @genfeedai/auth-client @genfeedai/config @genfeedai/core @genfeedai/pricing @genfeedai/workflow-engine @genfeedai/workflows @genfeedai/workflow-ui

Retire the redundant `@genfeedai/core` pricing facade in favor of
`@genfeedai/pricing`. Workflow execution contracts now come directly from
`@genfeedai/workflows/contracts`, and generation APIs use the canonical
`@genfeedai/workflows/generation` subpaths. Deployment, client, license, and
Better Auth decisions now each have a single runtime authority.
