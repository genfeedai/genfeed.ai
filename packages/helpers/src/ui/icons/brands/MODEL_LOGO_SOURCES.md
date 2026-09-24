# Model provider artwork

Verified 2026-09-24. `model-provider-icons.ts` contains locally bundled source artwork converted to React SVG elements. Do not redraw brand marks or apply catalog accent colors to them. Preserve the source viewBox, aspect ratio, paths, and multicolor fills. Monochrome glyphs inherit the foreground to support both themes. Gradient/pattern IDs use React `useId` so repeated marks do not collide.

## Lobe Icons

These are community-maintained brand assets, not a claim of official endorsement or blanket brand-guideline compliance. Source is pinned to commit `5c1ecb4fb06b92519a39102482d4e8273f000422`. MIT attribution is in `LOBE_ICONS_LICENSE`; trademarks belong to their owners.

| Component | Source |
| --- | --- |
| AnthropicProviderIcon | [anthropic.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/anthropic.svg) |
| BflIcon | [bfl.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/bfl.svg) |
| BytedanceProviderIcon | [bytedance-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/bytedance-color.svg) |
| DeepseekProviderIcon | [deepseek-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/deepseek-color.svg) |
| FalIcon | [fal-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/fal-color.svg) |
| GoogleProviderIcon | [google-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/google-color.svg) |
| IdeogramIcon | [ideogram.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/ideogram.svg) |
| KlingIcon | [kling-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/kling-color.svg) |
| LumaIcon | [luma-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/luma-color.svg) |
| MetaProviderIcon | [meta-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/meta-color.svg) |
| MinimaxIcon | [minimax-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/minimax-color.svg) |
| MoonshotIcon | [moonshot.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/moonshot.svg) |
| OpenAiProviderIcon | [openai.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/openai.svg) |
| PixverseIcon | [pixverse-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/pixverse-color.svg) |
| PrunaIcon | [prunaai-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/prunaai-color.svg) |
| QwenIcon | [qwen-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/qwen-color.svg) |
| RecraftIcon | [recraft.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/recraft.svg) |
| ReplicateIcon | [replicate.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/replicate.svg) |
| RunwayIcon | [runway.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/runway.svg) |
| StabilityIcon | [stability-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/stability-color.svg) |
| TopazIcon | [topazlabs.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/topazlabs.svg) |
| ViduIcon | [vidu-color.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/vidu-color.svg) |
| XaiIcon | [xai.svg](https://github.com/lobehub/lobe-icons/blob/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons/xai.svg) |

## First-party artwork

- Higgsfield: the `hf-logo__glyph` SVG in the [official site header](https://higgsfield.ai/), with its monochrome foreground inherited.
- Mureka: [official icon manifest asset](https://static-cos.mureka.ai/mureka/icons/brand-logo-simple-f2dbb2a9.svg), with its monochrome foreground inherited.
- HeyGen: `heygen-symbol-blue-logo.svg` from the [official brand kit](https://dynamic.heygen.ai/Heygen%20Brand-kit/heygen-brandkit.zip), linked by the [brand guidelines](https://www.heygen.com/brand-kit). This official SVG contains an embedded raster image; preserve it rather than tracing it.
- Argil: [official 32px favicon](https://www.argil.ai/favicon-32x32.png), embedded unchanged as PNG.
- Wan: [official site favicon](https://g.alicdn.com/sail-web/wan-static-resources/0.0.30/images/favicon.ico), converted from ICO to PNG without redrawing or cropping.
- Leonardo: [official documentation favicon](https://files.readme.io/e6fd24fe6d94d90d5c885217bfc7e206f382cccef4e950586465ac1a3750f90d-Leonardo_Icon_ElectricPurple_1.png), embedded unchanged as PNG, linked from [the provider documentation](https://docs.leonardo.ai/).
- Genfeed retains its existing first-party `GenfeedIcon`; self-hosted retains the generic `DevIcon`.

The raster-backed marks are intentionally not presented as vector artwork. Nateraw is an individual model publisher without a verified brand asset here; the UI shows its initial instead of fabricating a logo. Unknown future providers use the same explicit text fallback.

No runtime logo service, remote image fetch, API token, or additional icon-package dependency is required. To update a mark, retrieve the linked source, preserve its artwork, update the component and provenance, and inspect it at its rendered size in both themes.
