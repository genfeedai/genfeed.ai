packages: @genfeedai/contracts @genfeedai/actions @genfeedai/prisma @genfeedai/agent

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

`@genfeedai/agent` replaces its prompt-bar generation-setup popover
(Type/Agent-pick/Brand-voice/Prompt-enhance) with a single
`AgentModeDropdown` (new export) driven by the same `AgentThreadMode`. Every
`planModeEnabled`-shaped field across the package's models, hooks, stores,
and API client is renamed to the `agentMode`/`mode` shape above — most
consumers are internal, but `AgentChatInput`/`AgentChatEmptyState`/
`AgentChatPromptBar` now require `agentMode` and `onAgentModeChange` props,
and `use-agent-chat-container`'s `togglePlanMode` is renamed `setAgentMode`.
`use-agent-generation-setup-presets` (Studio-Look presets for the removed
popover) is deleted — it had no consumer outside the popover. `GenerationActionCard`/
`useGenerationActionCard` add a `handleDecline` action (client-side only) and
an org-scoped `estimatedCredits`/`isEstimateAvailable`/`resolvedModelKey`
triple sourced from the new `agent-api.media` `estimateGenerationCredits`
call, for both image and video (previously video-only, client-quoted).
