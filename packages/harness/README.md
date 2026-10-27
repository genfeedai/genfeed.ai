# @genfeedai/harness

OSS contracts and registry helpers for brand-aware content generation.

This package is intentionally split into:

- contracts and composition helpers (`ContentHarnessPack`,
  `ContentHarnessRegistry`, `composeContentHarnessBrief`)
- built-in packs (`CORE_CONTENT_HARNESS_PACK`, `X_PLATFORM_HARNESS_PACK`,
  `LINKEDIN_PLATFORM_HARNESS_PACK`, `INSTAGRAM_PLATFORM_HARNESS_PACK`,
  `TIKTOK_PLATFORM_HARNESS_PACK`, `YOUTUBE_PLATFORM_HARNESS_PACK`,
  `BRAND_FIDELITY_HARNESS_PACK`, `VIRAL_PSYCHOLOGY_HARNESS_PACK`,
  `B2B_MEDIA_CRAFT_HARNESS_PACK`)
- external private packs, which the API loads at startup (see below)

For how a brief is composed end to end, profiles, review feedback and winner
promotion, read [docs/content-harness.md](../../docs/content-harness.md).

## Use

This is a private workspace package. Depend on it from another workspace package
with `"@genfeedai/harness": "workspace:*"`; it is not published to npm.

## Usage

```ts
import {
  CORE_CONTENT_HARNESS_PACK,
  ContentHarnessRegistry,
  composeContentHarnessBrief,
} from '@genfeedai/harness';

const registry = new ContentHarnessRegistry();
registry.registerPack(CORE_CONTENT_HARNESS_PACK);

const brief = await composeContentHarnessBrief(registry, {
  intent: {
    contentType: 'post',
    objective: 'engagement',
    platform: 'x',
    topic: 'AI content systems',
  },
  voiceProfile: {
    audience: ['technical founders'],
    messagingPillars: ['ship fast', 'own the stack'],
    style: 'direct',
    tone: 'confident',
  },
});
```

## External packs

The package does not load external packs itself. `ContentHarnessService` in the
API (`apps/server/api/src/services/harness/harness.service.ts`) registers the built-in
packs, then loads each package named in the `CONTENT_HARNESS_PACKAGES`
environment variable (comma-separated). A module must export a `ContentHarnessPack`
as `default` or as `CONTENT_HARNESS_PACK`; a pack needs a string `id` and `version`.

Each specifier ends in one state: `loaded`, `unresolvable`, `invalid` or
`load_failed`. Any state other than `loaded` fails API startup; there is no
fallback to built-in packs. With the variable unset, only built-in packs load.

## Related Packages

- `@genfeedai/contracts/interfaces`

## License

AGPL-3.0
