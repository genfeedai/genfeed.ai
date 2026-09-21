packages: @genfeedai/config

Add `REPLY_BOT_INTENT_DECISION_MODE` (`off` | `shadow` | `live`, default `off`)
and `REPLY_BOT_INTENT_MIN_CONFIDENCE` (default `0.85`) to the AI schema and
`IEnvConfig`, gating the typed decision that classifies an inbound comment's
intent before reply-bot acts on it.

Both keys are optional and default to today's behaviour: at `off` the existing
regex classifier decides, and the resolver also degrades to `off` when no
decision provider is bound, so no deployment and no self-hosted install needs
to set either one.
