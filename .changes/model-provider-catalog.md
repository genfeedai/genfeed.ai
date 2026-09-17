packages: helpers contracts

Add `getProviderBrands`, which groups the model catalog by brand so a surface
can render the providers behind it without maintaining a second list. Adds the
`ProviderBrand` interface it returns.

`extractBrandFromKey` now folds the catalog's two spellings of the same vendor
(`fal` onto `fal-ai`, `xai` onto `x-ai`) onto one slug — previously each pair
rendered as two separate brands anywhere the catalog was grouped.

**Breaking — `MODEL_KEYS`.** `HIGGSFIELD_KLING_VIDEO`
(`kling-video/v3/pro/image-to-video`) is removed: it named a model id the
vendor does not serve. `HIGGSFIELD_SOUL` changes value from
`higgsfield-ai/soul/standard` to `higgsfield-ai/soul`, and three DoP tiers
(`higgsfield-ai/dop-lite`, `-turbo`, `-standard`) are added. Anything holding
a removed or renamed key by its old value must be repointed; the corresponding
`MODEL_OUTPUT_CAPABILITIES` rows and the `kling-video/` BYOK prefix move with
them.
