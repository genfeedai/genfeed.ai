import nano from '@api/services/integrations/crun/contracts/fixtures/nano-banana-pro.openapi.json';
import pricing from '@api/services/integrations/crun/contracts/fixtures/pricing.json';
import seedream from '@api/services/integrations/crun/contracts/fixtures/seedream-4-5.openapi.json';

export const CRUN_PRICING_SNAPSHOT = pricing;
export const CRUN_IMAGE_MANIFEST = [
  {
    endpoint: 'google/nano-banana-pro',
    key: 'crun/google/nano-banana-pro',
    label: 'Nano Banana Pro (Crun)',
    schemaUrl: 'https://docs.crun.ai/models/google/nano-banana-pro.json',
    capturedAt: '2026-10-01T00:00:00.000Z',
    sha256: 'f3995d1b1645a61051b6f07c5420ca38141ed4ed7513fb62217221f58fe314fb',
    openapi: nano,
    overrides: {
      isAutoAspectReferenceRequired: true,
      serverOverrides: {},
      omitFields: [],
    },
  },
  {
    endpoint: 'bytedance/seedream-4-5',
    key: 'crun/bytedance/seedream-4-5',
    label: 'Seedream 4.5 (Crun)',
    schemaUrl: 'https://docs.crun.ai/models/seedream/seedream-4.5.json',
    capturedAt: '2026-10-01T00:00:00.000Z',
    sha256: '70d1bbb3fd9a71be7934a6f37a3dc019bb540ed61353da426cbb0c22aaef961a',
    openapi: seedream,
    overrides: {
      isAutoAspectReferenceRequired: false,
      serverOverrides: { num_outputs: 1, content_moderation: true },
      omitFields: ['num_outputs', 'content_moderation', 'enhance_prompt'],
    },
  },
] as const;

export type CrunManifestEntry = (typeof CRUN_IMAGE_MANIFEST)[number];
