packages: @genfeedai/contracts @genfeedai/contracts/constants @genfeedai/helpers @genfeedai/config

Add Eleven Music, Lyria 3 Pro, and Mureka V9 to the music model catalog:

- `ModelProvider` gains a new member, `MUREKA = 'mureka'`, for Mureka's
  direct API integration (not fal/Replicate).
- `MODEL_KEYS` gains `FAL_ELEVENLABS_MUSIC`, `FAL_LYRIA3_PRO`, `MUREKA_V9`.
- `MusicModelCapability` gains optional `supportsInstrumental`,
  `supportsVocals`, `supportsLyrics`, and `languages` fields.
- `MODEL_OUTPUT_CAPABILITIES` and `SELF_HOSTED_MODELS` gain curated (but
  `isActive: false`) entries for the three new keys.
- `@genfeedai/helpers`'s `MUSIC_QUALITY_MODELS` now offers the new models at
  STANDARD/HIGH/ULTRA tiers.
- `@genfeedai/config` gains a `murekaSchema` export (`MUREKA_API_KEY`,
  `MUREKA_API_BASE_URL`, `MUREKA_MODEL`) and `IEnvConfig` gains the matching
  optional fields.

No consumer action required for existing integrations — the new `ModelProvider`
member and catalog rows are additive, and the new models seed inactive until
an operator verifies and activates them in Settings → Models.
