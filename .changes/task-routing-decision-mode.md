packages: @genfeedai/config

Add the rollout gate of the `task_routing.output_type` typed decision (#4867) to
the shared env config: `TASK_ROUTING_DECISION_MODE` (`off | shadow | live`,
default `off`) and `TASK_ROUTING_MIN_CONFIDENCE` (`0..1`, default `0.85`), in
`generalAiSchema` (`./src/schemas/ai.schema`) and on `IEnvConfig`
(`./src/interfaces/env-config.interface`).

Both are optional with Joi defaults, so an existing environment keeps working
untouched and behaves exactly as before — `off` never calls a decision provider.
A deployment that wants the decision in shadow or live mode sets them alongside
`TYPED_DECISION_PROVIDER`; they are also carried to the api and workers services
by `scripts/env-spec.ts`.
