packages: @genfeedai/config

Export `modelDiscoveryDecisionSchema` and declare `MODEL_DISCOVERY_DECISION_MODE`
(`off|shadow|live`, default `off`) and `MODEL_DISCOVERY_MIN_CONFIDENCE`
(default `0.85`) on `IEnvConfig`.

The fragment is separate from `generalAiSchema` — which already spreads it — so
the `workers` runtime, whose ConfigService composes a much smaller schema than
the API's, can include the same keys and get the same defaults. The
model-discovery category decision (#4869) executes there.

Nothing is required of a consumer: both keys are optional and defaulted, and
`off` keeps the existing deterministic keyword path in control.
