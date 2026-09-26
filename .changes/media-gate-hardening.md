packages: @genfeedai/config

Document the media-gate threshold policy in the config schema (#4883).

- `MEDIA_GATE_VISION_MODE`, `MODERATION_PROVIDER`, `MODERATION_MODE`, `MODERATION_THRESHOLDS`, `MEDIA_TEXT_GATE_DECISION_MODE` and `MEDIA_TEXT_GATE_MIN_CONFIDENCE` now carry Joi descriptions: what each mode gates, and how each threshold is derived from the benchmark's calibration table.

Documentation only; no default or validation rule changed.
