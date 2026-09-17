packages: helpers contracts

Add `getProviderBrands`, which groups the model catalog by brand so a surface
can render the providers behind it without maintaining a second list. Adds the
`ProviderBrand` interface it returns.

`extractBrandFromKey` now folds the catalog's two spellings of the same vendor
(`fal` onto `fal-ai`, `xai` onto `x-ai`) onto one slug — previously each pair
rendered as two separate brands anywhere the catalog was grouped.
