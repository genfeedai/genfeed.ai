packages: @genfeedai/config

Narrow `EnvConfig.UNTRUSTED_CONTENT_DECISION_MODE` to `off | shadow`.
Live withholding is unavailable until authentic benchmark and real shadow-traffic
evidence passes independent review. Configurations using `live` must select `off`
or `shadow` before upgrading; Joi rejects `live` in every environment.

See `docs/untrusted-content-rollout.md` for the evidence and migration contract.
