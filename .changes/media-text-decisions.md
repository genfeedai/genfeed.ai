packages: @genfeedai/config @genfeedai/contracts @genfeedai/prisma

Run typed text decisions on perception output (#4882).

- `@genfeedai/contracts/api-types/contracts` gains the media text decision contract: the question set (`MEDIA_TEXT_DECISION_QUESTIONS`, `MEDIA_TEXT_DECISION_POINTS` for `isBrandSafe`, `isOnBrand`, `isCaptionConsistent`) and the persisted record schema.
- `@genfeedai/contracts/interfaces` gains `IMediaAssessmentRequest`, which extends the readiness request with an optional `caption`. `IMediaPublishGate.assessPublishMedia` now takes it.
- `@genfeedai/config` gains `MEDIA_TEXT_GATE_DECISION_MODE` (off|shadow|live, default off) and `MEDIA_TEXT_GATE_MIN_CONFIDENCE` (default 0.85).
- `@genfeedai/prisma` gains `MediaTextDecision` (`media_text_decisions`).

Additive. With the mode `off`, or no typed-decision provider bound, nothing is judged and assessments are unchanged.
