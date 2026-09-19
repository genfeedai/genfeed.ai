packages: @genfeedai/harness

Complete the persuasion score contract (#4616).

- `persuasion/viral-psychology`: the provider hint now asks for `overall`
  alongside the four layer scores. New `normalizePersuasionScores()`
  rejects incomplete score objects and derives `overall` as the mean of the
  layers, and new `derivePersuasionOverallScore()` computes that mean.
- `contracts`: re-exports `PERSUASION_LAYERS`, `PERSUASION_SCORE_KEYS` and
  `PersuasionLayerId` through the frontend-safe subpath. Additive only.
