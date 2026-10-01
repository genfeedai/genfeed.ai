import kling from '@api/services/integrations/crun/contracts/fixtures/kling-v2-5-turbo-pro.openapi.json';
import nano from '@api/services/integrations/crun/contracts/fixtures/nano-banana-pro.openapi.json';
import pricing from '@api/services/integrations/crun/contracts/fixtures/pricing.json';
import seedream from '@api/services/integrations/crun/contracts/fixtures/seedream-4-5.openapi.json';
import veo from '@api/services/integrations/crun/contracts/fixtures/veo3-1-fast-t2v.openapi.json';

export const CRUN_PRICING_SNAPSHOT = {
  ...pricing,
  rates: pricing.rates.filter((rate) =>
    ['google/nano-banana-pro', 'bytedance/seedream-4-5'].includes(
      rate.endpoint,
    ),
  ),
};
export const CRUN_VIDEO_PRICING_SNAPSHOT = {
  ...pricing,
  rates: pricing.rates.filter((rate) =>
    ['kling/v2-5-turbo-pro', 'google/veo3-1-fast-t2v'].includes(rate.endpoint),
  ),
};
export const CRUN_IMAGE_MANIFEST = [
  {
    mediaKind: 'image',
    schemaFamily: 'crun-image-v1',
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
    mediaKind: 'image',
    schemaFamily: 'crun-image-v1',
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

export const CRUN_VIDEO_MANIFEST = [
  {
    mediaKind: 'video',
    schemaFamily: 'crun-kling-video-v1',
    endpoint: 'kling/v2-5-turbo-pro',
    key: 'crun/kling/v2-5-turbo-pro',
    label: 'Kling 2.5 Turbo Pro (Crun)',
    schemaUrl: 'https://docs.crun.ai/models/kling/v2-5-turbo-pro.json',
    capturedAt: '2026-10-01T00:00:00.000Z',
    sha256: 'eb95fc0521f13efda31a4769d5a881d93c4ff2f42a116aab553d613a41abb45a',
    openapi: kling,
    videoRules: {
      referenceMode: 'start-end',
      omitAspectRatioWithReferences: true,
      availableDurations: [5, 10],
    },
    overrides: {
      isAutoAspectReferenceRequired: false,
      serverOverrides: {},
      omitFields: [],
    },
  },
  {
    mediaKind: 'video',
    schemaFamily: 'crun-veo-fast-video-v1',
    endpoint: 'google/veo3-1-fast-t2v',
    key: 'crun/google/veo3-1-fast-t2v',
    label: 'Veo 3.1 Fast (Crun)',
    schemaUrl:
      'https://docs.crun.ai/models/google/veo-3-1-fast-text-to-video.json',
    capturedAt: '2026-10-01T00:00:00.000Z',
    sha256: '6d7a07573b9f72f5af32f57556f22694656426f001de49fe7c20a12e9d0ce542',
    openapi: veo,
    videoRules: {
      referenceMode: 'none',
      omitAspectRatioWithReferences: false,
      availableDurations: [8],
    },
    overrides: {
      isAutoAspectReferenceRequired: false,
      serverOverrides: {},
      omitFields: [],
    },
  },
] as const;
export const CRUN_MODEL_MANIFEST = [
  ...CRUN_IMAGE_MANIFEST,
  ...CRUN_VIDEO_MANIFEST,
] as const;
export type CrunManifestEntry = (typeof CRUN_MODEL_MANIFEST)[number];
export function getCrunPricingSnapshot(entry: CrunManifestEntry) {
  return entry.mediaKind === 'image'
    ? CRUN_PRICING_SNAPSHOT
    : {
        ...CRUN_VIDEO_PRICING_SNAPSHOT,
        rates: CRUN_VIDEO_PRICING_SNAPSHOT.rates.filter(
          (rate) => rate.endpoint === entry.endpoint,
        ),
      };
}

export const CRUN_RESPONSE_CAPTURES = [
  {
    file: 'task-info.openapi.json',
    schemaUrl: 'https://docs.crun.ai/models/common/get-task-info.json',
    capturedAt: '2026-10-01T00:00:00.000Z',
    sha256: '866607e881f63b0103efe041296c9fc71e46dff15329c6ee751029d6f638a6ca',
  },
  {
    file: 'estimate-credits.openapi.json',
    schemaUrl: 'https://docs.crun.ai/common-api/estimate-task-credits.json',
    capturedAt: '2026-10-01T00:00:00.000Z',
    sha256: 'e8d9d5491ffb8b34382386e5c098f4960ac0aa1037c624e0f35fca507647315d',
  },
] as const;
