packages: @genfeedai/contracts

Add a `hasStyle` field to `StudioGenerateCapabilities`
(`src/interfaces/studio/studio-generate.interface.ts`) and a `style` field to
`MusicGenerationPayload` (`src/interfaces/content/generation-payload.interface.ts`).

- `hasStyle` is a new required boolean on `StudioGenerateCapabilities` — every
  object literal typed against this interface (the Studio type-config
  registry, the agent composer's own capability map, and their tests) must
  now supply it. It is `true` only for the `music` generate type; genre/style
  is folded into the generation prompt server-side identically for every
  music provider, so it needs no per-model narrowing the way
  `hasInstrumentalToggle`/`hasLyrics` do (#4681 follow-up: those two are now
  narrowed per-model against `MODEL_OUTPUT_CAPABILITIES`, since MusicGen has
  no vocals/lyrics support at all).
- `MusicGenerationPayload.style` is additive/optional — no existing consumer
  is affected.

Consumer action: any code outside this monorepo that constructs a
`StudioGenerateCapabilities` object literal (rather than spreading an
existing one) must add `hasStyle`.
