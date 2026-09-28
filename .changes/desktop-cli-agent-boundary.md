packages: @genfeedai/agent @genfeedai/contracts

Desktop local CLI agent: turn ownership and Codex readiness.

- `@genfeedai/agent`: `DesktopCliAgentTurnHandle` carries the turn's `runId`
  and `threadId`, so Stop only cancels the local turn of the visible thread.
  `AgentRuntimeCatalog` adds `localToolNotice`, the upgrade step for an
  installed CLI that is too old to run agent turns.
- `@genfeedai/agent`: a thread bound to `local/claude-cli` or
  `local/codex-cli` stays on that runtime in Desktop when the CLI is missing
  or outdated. `resolveDesktopCliRuntimeKey` no longer takes `desktopTools`.
  `resolveDesktopCliRuntimeBlocker` explains why the CLI cannot run.
  `DesktopCliAgentChat.blockedReason` makes the composer refuse the send, and
  `AgentRuntimeSelection.runtimeNotice` shows why in the runtime bar.
  `AgentRuntimeSelector` takes `selectedRuntime` instead of
  `selectedRuntimeKey`. `useDesktopLocalTools` returns
  `{ isResolved, tools }`: until detection resolves, a bound thread's send is
  refused with `DESKTOP_CLI_RUNTIME_CHECKING_MESSAGE` and the draft is kept.
  `getDesktopCliRuntimeOption` is a new export.
- `@genfeedai/contracts`: `IDesktopLocalToolReadiness.upgradesRequired`
  (optional, `IDesktopLocalToolUpgrade[]`) lists those CLIs.
