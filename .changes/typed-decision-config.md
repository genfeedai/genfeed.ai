packages: @genfeedai/config

Add the typed-decision keys (#4864) to the AI schema and the env-config
interface: `TYPED_DECISION_PROVIDER` (`none` | `jev`, default `none`),
`TYPED_DECISION_TIMEOUT_MS` (default 800) and `TYPESAFE_API_KEY`.

Purely additive and optional. A deployment that sets none of them keeps the
default `none` provider, which resolves every typed decision to `null` without a
network call, so self-hosted installs need no action.
