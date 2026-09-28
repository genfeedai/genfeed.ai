packages: @genfeedai/pages @genfeedai/services

Storyboard interpolation now carries its auto-merge settings (#5460).

- `@genfeedai/services`: `VideosService.postBatchInterpolation` accepts an
  optional `mergeSettings` (`IVideoMergeSettings`: transition, duration, easing,
  captions, mute, music and volume) that the auto-merge applies once every
  transition finishes.
- `@genfeedai/pages`: `UseStoryboardGenerationParams` gains an optional
  `mergeSettings`, which `useStoryboardGeneration` forwards with the batch.

Both additions are optional; existing callers need no change.
