# @genfeedai/harness

OSS contracts and registry helpers for brand-aware content generation.

This package is intentionally split into:

- OSS contracts and composition helpers
- `ee/` packs inside this monorepo
- external private packs loaded by package name at runtime

## Install

```bash
npm i @genfeedai/harness
```

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

## Related Packages

- `@genfeedai/interfaces`
- `@genfeedai/prompts`

## License

AGPL-3.0
