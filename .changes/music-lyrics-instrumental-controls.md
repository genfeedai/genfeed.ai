packages: @genfeedai/pages

Add `instrumental`/`lyrics`/`style` fields to the Studio music generation
pipeline, and make per-model capability/duration gating a first-class export:

- `buildMusicPayload` (`studio/generate/utils/generation-payloads.ts`) now
  accepts and forwards `instrumental`/`lyrics`/`style` from the prompt data,
  and strips `instrumental`/`lyrics` when the resolved model's own
  `MODEL_OUTPUT_CAPABILITIES` entry doesn't support them (e.g. MusicGen has
  no vocals at all) rather than trusting whichever control the UI rendered.
- `getDefaultStudioGenerateSettings` (`studio/generate/utils/studio-generate-settings.ts`)
  seeds `instrumental: false` for the music type; `STUDIO_MUSIC_DURATIONS`
  widened from `[10, 15, 30]` to `[5, 10, 15, 20, 30, 45, 60, 90]` to cover
  Eleven Music, Lyria 3 Pro, and Mureka V9's duration ranges (#4680).
- `STUDIO_BRIDGED_SETTINGS_KEYS` (`studio/generate/utils/studio-generation-setup-bridge.ts`)
  gains `instrumental`/`lyrics`/`style` so the shared Unified Generation Setup
  store round-trips all three fields for the music type.
- New export `resolveStudioGenerateCapabilities` (`studio/generate/utils/studio-generate-types.ts`)
  narrows the static per-type capabilities against the selected model's own
  registry capability for music (`hasInstrumentalToggle`/`hasLyrics`) — the
  static `getStudioGenerateTypeConfig` config remains the widest case across
  every music model and is unchanged; callers that need the model-aware
  version should call the new function instead.

No consumer action required — additive fields, a wider duration list, and a
new export; no existing export removed or narrowed.
