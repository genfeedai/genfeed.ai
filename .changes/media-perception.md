packages: @genfeedai/config @genfeedai/contracts @genfeedai/prisma @genfeedai/serializers

Add media perception (#4879): per-asset sampled frames, OCR text, transcript
and a schema-enforced scene description, persisted once per asset hash.

- `@genfeedai/contracts/api-types/contracts` gains the perception contract:
  `mediaSceneDescriptionSchema` (vision-model output), frame/OCR/transcript
  schemas, the files-service fingerprint and artefact payloads, and the
  persisted `mediaPerceptionRecordSchema`.
- `@genfeedai/contracts/interfaces` gains `IMediaPerception` and
  `IMediaPerceptionLookup`; `@genfeedai/contracts/queue` gains
  `MEDIA_PERCEPTION_QUEUE` and `MediaPerceptionJobData`.
- `@genfeedai/config` gains `MEDIA_PERCEPTION_ENABLED` (default `true`),
  `MEDIA_PERCEPTION_FRAME_COUNT` (1–24, default 6),
  `MEDIA_PERCEPTION_LOOKBACK_HOURS` (1–720, default 24) and
  `MEDIA_PERCEPTION_VISION_MODEL` (optional).
- `@genfeedai/prisma` gains the `MediaPerception` model (`media_perceptions`).
- `@genfeedai/serializers` gains the `media-perception` serializer.

Additive only. Scene-description booleans follow the repository convention
(`hasPeople`, `hasSuspectedMinors`) rather than the issue's `contains*` names.
