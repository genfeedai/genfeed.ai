packages: @genfeedai/config @genfeedai/contracts @genfeedai/prisma

Make media gates tighten the publish policy (#4881).

- `@genfeedai/contracts/api-types/contracts`:
  - `evaluateAgentPublishPolicy` accepts an optional `mediaAssessment` (`isBlocking`, `reasons`).
  - `applyMediaAssessmentToPublishPolicy` is the tighten-only step: PERMITTED can become DENIED, never the reverse.
  - `AgentPublishPolicyResult` gains `mediaAssessmentReasons`.
  - New media assessment contract (`MediaAssessment`, reasons by source).
  - The vision rubric (`visionRubricSchema`, `contentQualityVisionScoringSchema`, `deriveVisionFlags`).
- `@genfeedai/contracts/interfaces`: `IMediaPublishGate` (readiness gate plus `assessPublishMedia`) and `isMediaPublishGate`. `IEvaluationData` gains `visionRubric`.
- `@genfeedai/config`: `MEDIA_GATE_VISION_MODE` (off|shadow|live, default off).
- `@genfeedai/prisma`: `media_perceptions.visionEvaluationId`.

With the mediaAssessment argument omitted, `evaluateAgentPublishPolicy` returns exactly the previous decision. Existing callers are unchanged.
