packages: @genfeedai/agent @genfeedai/contracts

Desktop local CLI agent: turn ownership and Codex readiness.

- `@genfeedai/agent`: `DesktopCliAgentTurnHandle` carries the turn's `runId`
  and `threadId`, so Stop only cancels the local turn of the visible thread.
  `AgentRuntimeCatalog` adds `localToolNotice`, the upgrade step for an
  installed CLI that is too old to run agent turns.
- `@genfeedai/contracts`: `IDesktopLocalToolReadiness.upgradesRequired`
  (optional, `IDesktopLocalToolUpgrade[]`) lists those CLIs.
