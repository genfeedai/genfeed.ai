packages: @genfeedai/contracts @genfeedai/actions @genfeedai/prisma

Add `AgentThreadMode` (`auto` | `manual` | `plan`), `DEFAULT_AGENT_THREAD_MODE`,
and `normalizeAgentThreadMode` to `@genfeedai/contracts` — the per-thread agent
mode (#4672) that replaces the old `AgentThread.planModeEnabled` boolean.
`ISetting` gains an optional `agentMode` field for the user's saved default
mode.

Add `AGENT_ACTION_CLASS`, `AgentActionClass`, `AgentThreadModeValue`,
`getAgentActionClass`, `resolveEffectiveMutationPolicy`, and
`VISUAL_GENERATION_REVIEW_TOOL_NAMES` to `@genfeedai/actions` — the mode-aware
confirmation-matrix classification consumed by the agent tool executor.
`@genfeedai/actions` stays dependency-free, so `AgentThreadModeValue` mirrors
`AgentThreadMode`'s runtime strings rather than importing the enum.

Existing callers are unaffected: `resolveEffectiveMutationPolicy` returns a
tool's already-declared `mutationPolicy` unchanged whenever `mode` is
`undefined` (no thread — MCP, CLI, a recurring task, a system-triggered batch)
or the tool is not one of the four classified action classes.

`@genfeedai/prisma`'s generated `AgentThread` type drops `planModeEnabled:
boolean` in favor of `mode: string` (the `AgentThreadMode` values); `Setting`
gains `agentMode: string`. Migration
`20260911190000_agent_thread_mode_and_setting_default` backfills existing
plan-mode threads to `mode: 'plan'` and everything else to `'manual'`.
