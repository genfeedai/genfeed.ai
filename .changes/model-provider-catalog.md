packages: helpers, contracts, config

Add `getProviderBrands`, which groups the model catalog by brand so a surface
can render the providers behind it without maintaining a second list. Adds the
`ProviderBrand` interface it returns.

`extractBrandFromKey` now folds the catalog's two spellings of the same vendor
(`fal` onto `fal-ai`, `xai` onto `x-ai`) onto one slug — previously each pair
rendered as two separate brands anywhere the catalog was grouped.

Higgsfield `MODEL_KEYS` now match documented REST endpoint ids on
`https://api.higgsfield.ai`:

- `HIGGSFIELD_SOUL` is `higgsfield-ai/soul/v2/standard` (was
  `higgsfield-ai/soul/standard`, then briefly `higgsfield-ai/soul`)
- DoP keys are `higgsfield-ai/dop/{lite,turbo,standard}`
- Kling-on-Higgsfield (`HIGGSFIELD_KLING_VIDEO`) is removed; DoP is the
  Higgsfield video path

`@genfeedai/config` gains `HIGGSFIELD_API_BASE_URL`, which overrides the
documented host. Unset, the client posts to `https://api.higgsfield.ai`.
