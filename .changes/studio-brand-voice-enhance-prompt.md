packages: @genfeedai/client @genfeedai/helpers @genfeedai/pages @genfeedai/props

Studio brand voice / prompt enhance fix (#4676):

- `@genfeedai/client`: `StudioLook` no longer declares `isPromptEnhanceEnabled`
  — the field was dropped from the persisted Studio Look entity.
- `@genfeedai/helpers`: `buildStudioLookPayload` no longer sends
  `isPromptEnhanceEnabled`, and `presetToGenerationSetupValues` no longer
  reads it back from a preset.
- `@genfeedai/pages`: `StudioGenerateComposerProps` gained optional
  `isEnhancingPrompt` and `onEnhancePrompt` props for the new Enhance prompt
  composer action; a new `useStudioPromptEnhancement` hook is exported from
  `studio/generate/hooks`.
- `@genfeedai/props`: `StudioGenerateComposerProps` (same shape change as
  above, defined in this package).

No consumer action required — the new composer props are optional and the
removed Studio Look field had no functional effect (see the issue's audit).
