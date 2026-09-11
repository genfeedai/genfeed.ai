packages: @genfeedai/pages

Add `instrumental`/`lyrics` fields to the Studio music generation pipeline:

- `buildMusicPayload` (`studio/generate/utils/generation-payloads.ts`) now
  accepts and forwards `instrumental`/`lyrics` from the prompt data.
- `getDefaultStudioGenerateSettings` (`studio/generate/utils/studio-generate-settings.ts`)
  seeds `instrumental: false` for the music type; `STUDIO_MUSIC_DURATIONS`
  widened from `[10, 15, 30]` to `[5, 10, 15, 20, 30, 45, 60, 90]` to cover
  Eleven Music, Lyria 3 Pro, and Mureka V9's duration ranges (#4680).
- `STUDIO_BRIDGED_SETTINGS_KEYS` (`studio/generate/utils/studio-generation-setup-bridge.ts`)
  gains `instrumental`/`lyrics` so the shared Unified Generation Setup store
  round-trips both fields for the music type.

No consumer action required — additive fields and a wider duration list, no
existing export removed or narrowed.
