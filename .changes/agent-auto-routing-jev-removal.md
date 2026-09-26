packages: @genfeedai/config

Release-blocker follow-up to #4865 (epic #4863): agent auto-model routing no
longer calls the typed-decision provider (Jev). Remove
`AGENT_AUTO_ROUTING_MIN_CONFIDENCE` from the AI schema and `IEnvConfig` — the
routing candidate is now a deterministic read of the Admin-configured model
registry, so there is no confidence to gate on. `AGENT_AUTO_ROUTING_DECISION_MODE`
keeps its `off | shadow | live` shape with the same meaning shifted: `shadow`
logs the candidate it would dispatch, `live` dispatches it, no provider call
either way.

Narrow `TASK_ROUTING_DECISION_MODE` and `PATTERN_ANALYZER_DECISION_MODE` from
`off | shadow | live` to `off | shadow` in `IEnvConfig` and the AI schema.
Both decision points (#4867, #4868) are capped at shadow: Jev still computes
and records its answer, but neither decision point can act on it any more.
