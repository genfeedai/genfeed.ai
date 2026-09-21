packages: @genfeedai/config @genfeedai/contracts

Add the untrusted-content injection gate's rollout configuration and its typed
contract. `@genfeedai/config` gains `UNTRUSTED_CONTENT_DECISION_MODE`
(`off|shadow|live`) and `UNTRUSTED_CONTENT_MIN_CONFIDENCE` (0..1), both
validated by the AI schema and surfaced on `IEnvConfig`.
`@genfeedai/contracts/interfaces` gains `AgentUntrustedContentSource`,
`AgentUntrustedContentGateOutcome`, `AgentUntrustedContentGateResult`, their
two parse helpers, and the audit document and create-input types.

Both env keys default to today's behaviour — the mode is `off` and the
threshold is 0.95 — so an existing deployment needs no action. A consumer that
constructs its own `IEnvConfig` may set them; nothing reads them unless the
decision provider is configured.
