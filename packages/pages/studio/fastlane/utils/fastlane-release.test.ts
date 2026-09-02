import { PostVisibility, ReleaseStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import type { FastlaneAssetItem, FastlaneScheduleTarget } from '../types';
import { buildFastlaneReleaseInput } from './fastlane-release';

function makeAsset(
  overrides: Partial<FastlaneAssetItem> = {},
): FastlaneAssetItem {
  return {
    idea: {
      id: 'idea-1',
      format: 'image',
      hook: 'Hook line that stops the scroll',
      caption: 'Ready caption',
      visualPrompt: 'prompt',
      platformHints: ['tiktok'],
    },
    ingredientId: 'ingredient-1',
    status: 'approved',
    ...overrides,
  };
}

function makeTarget(
  credentialId: string,
  platform: string,
): FastlaneScheduleTarget {
  return { credentialId, platform };
}

describe('buildFastlaneReleaseInput', () => {
  it('builds a draft release with one target per credential', () => {
    const input = buildFastlaneReleaseInput({
      asset: makeAsset(),
      brandId: 'brand-1',
      caption: 'Edited caption',
      targets: [
        makeTarget('cred-a', 'tiktok'),
        makeTarget('cred-b', 'instagram'),
      ],
      timezone: 'UTC',
    });

    expect(input).toEqual({
      baseContent: 'Edited caption',
      brandId: 'brand-1',
      media: [{ assetId: 'ingredient-1', kind: 'image' }],
      status: ReleaseStatus.DRAFT,
      targets: [
        {
          credentialId: 'cred-a',
          order: 0,
          platform: 'tiktok',
          visibility: PostVisibility.PUBLIC,
        },
        {
          credentialId: 'cred-b',
          order: 1,
          platform: 'instagram',
          visibility: PostVisibility.PUBLIC,
        },
      ],
      timezone: 'UTC',
      title: 'Hook line that stops the scroll',
    });
  });

  it('maps video and avatar formats to video media', () => {
    const video = buildFastlaneReleaseInput({
      asset: makeAsset({
        idea: {
          ...makeAsset().idea,
          format: 'video',
        },
      }),
      brandId: 'brand-1',
      caption: 'Caption',
      targets: [makeTarget('cred-a', 'tiktok')],
      timezone: 'UTC',
    });
    const avatar = buildFastlaneReleaseInput({
      asset: makeAsset({
        idea: {
          ...makeAsset().idea,
          format: 'avatar',
        },
      }),
      brandId: 'brand-1',
      caption: 'Caption',
      targets: [makeTarget('cred-a', 'tiktok')],
      timezone: 'UTC',
    });

    expect(video?.media).toEqual([{ assetId: 'ingredient-1', kind: 'video' }]);
    expect(avatar?.media).toEqual([{ assetId: 'ingredient-1', kind: 'video' }]);
  });

  it('drops unknown platforms and returns null when none remain', () => {
    expect(
      buildFastlaneReleaseInput({
        asset: makeAsset(),
        brandId: 'brand-1',
        caption: 'Caption',
        targets: [makeTarget('cred-a', 'not-a-platform')],
        timezone: 'UTC',
      }),
    ).toBeNull();
  });

  it('returns null without an ingredient', () => {
    expect(
      buildFastlaneReleaseInput({
        asset: makeAsset({ ingredientId: null }),
        brandId: 'brand-1',
        caption: 'Caption',
        targets: [makeTarget('cred-a', 'tiktok')],
        timezone: 'UTC',
      }),
    ).toBeNull();
  });

  it('omits an empty brand id', () => {
    const input = buildFastlaneReleaseInput({
      asset: makeAsset(),
      brandId: '  ',
      caption: 'Caption',
      targets: [makeTarget('cred-a', 'tiktok')],
      timezone: 'UTC',
    });

    expect(input).not.toHaveProperty('brandId');
  });
});
