packages: @genfeedai/config

Add `AGENT_AUTO_ROUTING_DECISION_MODE` (`off` | `shadow` | `live`, default `off`)
and `AGENT_AUTO_ROUTING_MIN_CONFIDENCE` (default `0.85`) to the AI schema and
`IEnvConfig`, gating the typed decision that picks the agent chat model for a
turn requested as `openrouter/auto`.

Both keys are optional and default to today's behaviour: at `off` the gateway
auto-router is used exactly as before, so no deployment and no self-hosted
install needs to set either one.
