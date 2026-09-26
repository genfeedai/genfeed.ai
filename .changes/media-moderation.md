packages: @genfeedai/config @genfeedai/contracts @genfeedai/prisma @genfeedai/serializers

Add the media moderation classifier (#4880) behind a provider adapter.

- `@genfeedai/contracts` gains the `ModerationCategory` enum, the moderation
  contract (scores, verdict, thresholds with `DEFAULT_MODERATION_THRESHOLDS`,
  persisted record, and the shared `MediaGateMode` off|shadow|live), the
  `IModerationProvider` port, `IMediaModeration`, `MEDIA_MODERATION_QUEUE`, and
  a `media-moderation-flagged` activity key with a `flagged` lifecycle.
- `@genfeedai/config` gains `MODERATION_PROVIDER` (none|openai, default none),
  `MODERATION_MODE` (off|shadow|live, default shadow) and
  `MODERATION_THRESHOLDS` (`category=confidence` overrides).
- `@genfeedai/prisma` gains `MediaModeration` (`media_moderations`).
- `@genfeedai/serializers` gains the `media-moderation` serializer.

Additive only. With the default `MODERATION_PROVIDER=none` nothing is
classified, no media leaves the host, and no verdict is persisted.
