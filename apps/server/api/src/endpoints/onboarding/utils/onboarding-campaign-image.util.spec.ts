import { buildCampaignImagePromptPrefix } from '@api/endpoints/onboarding/utils/onboarding-campaign-image.util';
import { describe, expect, it } from 'vitest';

describe('buildCampaignImagePromptPrefix', () => {
  it.each([
    ['twitter', 'twitter', 'a wide X post image'],
    ['instagram', 'instagram', 'a portrait Instagram feed image'],
    ['linkedin', 'linkedin', 'a wide LinkedIn article banner'],
    ['tiktok-1', 'tiktok', 'a vertical TikTok slide'],
  ] as const)('recomposes the master for %s', (id, platform, format) => {
    expect(buildCampaignImagePromptPrefix({ id, platform })).toBe(
      `Match the style, palette, lighting and subject of the first reference image, the campaign master, and recompose it as ${format}.`,
    );
  });

  it('asks for a closer detail with room for text on the second TikTok slide', () => {
    expect(
      buildCampaignImagePromptPrefix({ id: 'tiktok-2', platform: 'tiktok' }),
    ).toContain('second slide: show a closer detail');
  });
});
