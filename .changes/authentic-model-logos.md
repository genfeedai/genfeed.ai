packages: helpers, contracts

Replace model-provider icon artwork with locally bundled, sourced brand marks.
Add `AnthropicProviderIcon`, `BflIcon`, `BytedanceProviderIcon`,
`DeepseekProviderIcon`, `GoogleProviderIcon`, `LeonardoIcon`, `MetaProviderIcon`,
`MurekaIcon`, `OpenAiProviderIcon`, `PixverseIcon`, `RecraftIcon`, `StabilityIcon`,
`ViduIcon`, and `XaiIcon` to the model-provider-icons module.

Existing provider-icon exports retain their SVG props. Monochrome marks inherit
foreground color; multicolor marks preserve source fills. Consumers should remove
catalog accent-color overrides and render these components through React so their
per-instance gradient and pattern IDs remain unique. The brand lookup uses
`BflIcon` for BFL while retaining `flux` as a legacy direct lookup key for
`FluxIcon`.

In `@genfeedai/contracts`, `ModelBrandIconKey` adds `bfl`, `leonardo`, `mureka`,
`pixverse`, `recraft`, `stability`, and `vidu`. The `MODEL_BRANDS` catalog changes
`black-forest-labs.iconKey` from `flux` to `bfl` and adds provider rows `leonardoai`,
`mureka`, `pixverse`, `recraft-ai`, `sdxl`, and `vidu`. Consumers using an exhaustive
icon-key map must support the new keys; consumers matching BFL by its catalog
icon key should use `bfl`.

Artwork provenance and raster-backed exceptions are documented in
`packages/helpers/src/ui/icons/brands/MODEL_LOGO_SOURCES.md`.
