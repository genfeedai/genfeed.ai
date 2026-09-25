packages: @genfeedai/actions @genfeedai/agent @genfeedai/hooks @genfeedai/pages @genfeedai/props @genfeedai/serializers @genfeedai/services @genfeedai/contracts

Agent brand context parity, CLI runtime and usage-based chat pricing.

- `@genfeedai/actions`: curated catalog adds the `get_brand_context` action
  (agent + MCP surfaces).
- `@genfeedai/agent`: desktop CLI runtime (`useDesktopCliAgentChat`,
  `useAgentRuntimeSelection`, `useDesktopLocalTools`, `AgentDesktopRuntimeBar`,
  desktop bridge and CLI turn utils, desktop terminal transport). The runtime
  catalog now offers `local/claude-cli` / `local/codex-cli` only when the desktop
  bridge reports the binary; the localhost + server-readiness path is removed.
- `@genfeedai/hooks`: `useAgentModelAccess` (free-tier model lock state).
- `@genfeedai/pages`: `AgentProfilePromptingFields`; the brand voice card hook
  exposes the voice corpus summary and edits strategy topics and prompting.
- `@genfeedai/props`: unit economics, agent context, and model routing props.
- `@genfeedai/serializers`: `agent-brand-context`, `agent-memory`, and
  `unit-economics-report` serializers; brand memory insight serializer.
- `@genfeedai/services`: unit economics, agent brand context, agent credits,
  and brand memory client services; `generateBrandVoice` accepts `samples`.
- `@genfeedai/contracts`: credit display helpers, agent external runtime keys,
  agent brand context / voice corpus / external turn interfaces, desktop bridge
  runtime and server-profile types.

Consumers of `GET /agent/credits` now receive `{ balance, modelAccess,
modelCosts }` where `modelCosts` is the estimated credits per average message.
