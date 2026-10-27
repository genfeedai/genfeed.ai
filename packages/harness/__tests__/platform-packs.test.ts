import { describe, expect, it } from 'vitest';
import { composeContentHarnessBrief } from '../src/compose';
import { CORE_CONTENT_HARNESS_PACK } from '../src/defaults';
import {
  INSTAGRAM_PLATFORM_HARNESS_PACK,
  isInstagramPlatform,
} from '../src/platforms/instagram';
import {
  isLinkedInPlatform,
  LINKEDIN_PLATFORM_HARNESS_PACK,
} from '../src/platforms/linkedin';
import { matchesPlatform } from '../src/platforms/platform-match';
import {
  isTikTokPlatform,
  TIKTOK_PLATFORM_HARNESS_PACK,
} from '../src/platforms/tiktok';
import { X_PLATFORM_HARNESS_PACK } from '../src/platforms/x-algorithm';
import {
  isYouTubePlatform,
  YOUTUBE_PLATFORM_HARNESS_PACK,
} from '../src/platforms/youtube';
import { ContentHarnessRegistry } from '../src/registry';
import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
  ContentKind,
} from '../src/types';

const PLATFORM_PACKS = [
  { pack: LINKEDIN_PLATFORM_HARNESS_PACK, platform: 'linkedin' },
  { pack: INSTAGRAM_PLATFORM_HARNESS_PACK, platform: 'instagram' },
  { pack: TIKTOK_PLATFORM_HARNESS_PACK, platform: 'tiktok' },
  { pack: YOUTUBE_PLATFORM_HARNESS_PACK, platform: 'youtube' },
] as const;

function input(
  platform: string | undefined,
  contentType: ContentKind = 'post',
): ContentHarnessInput {
  return {
    intent: { contentType, objective: 'engagement', platform },
  };
}

function contribute(
  pack: ContentHarnessPack,
  harnessInput: ContentHarnessInput,
): ContentHarnessContribution {
  const result = pack.contribute?.(harnessInput);
  if (!result || result instanceof Promise) {
    throw new Error('Expected a synchronous contribution');
  }
  return result;
}

function allDirectives(contribution: ContentHarnessContribution): string[] {
  return [
    ...(contribution.systemDirectives ?? []),
    ...(contribution.styleDirectives ?? []),
    ...(contribution.guardrails ?? []),
    ...(contribution.evaluationCriteria ?? []),
  ];
}

describe('matchesPlatform', () => {
  it('matches bare, domain and scoped spellings, case-insensitively', () => {
    expect(matchesPlatform('LinkedIn', ['linkedin'])).toBe(true);
    expect(matchesPlatform(' linkedin.com ', ['linkedin'])).toBe(true);
    expect(matchesPlatform('linkedin/posts', ['linkedin'])).toBe(true);
    expect(matchesPlatform('linkedinx', ['linkedin'])).toBe(false);
    expect(matchesPlatform('', ['linkedin'])).toBe(false);
    expect(matchesPlatform(undefined, ['linkedin'])).toBe(false);
  });

  it('maps format channels to their platform', () => {
    expect(isInstagramPlatform('reels')).toBe(true);
    expect(isYouTubePlatform('shorts')).toBe(true);
    expect(isLinkedInPlatform('instagram')).toBe(false);
    expect(isTikTokPlatform('youtube')).toBe(false);
  });
});

describe.each(PLATFORM_PACKS)('$pack.id', ({ pack, platform }) => {
  it('is copy-only so caption rules never reach media prompts', () => {
    expect(pack.surfaces).toEqual(['copy']);
  });

  it('contributes on its own platform', () => {
    const contribution = contribute(pack, input(platform));
    expect(contribution.systemDirectives?.length).toBeGreaterThan(0);
    expect(contribution.styleDirectives?.length).toBeGreaterThan(0);
    expect(contribution.guardrails?.length).toBeGreaterThan(0);
    expect(contribution.evaluationCriteria?.length).toBeGreaterThan(0);
  });

  it('is a no-op on every other platform and with no platform', () => {
    for (const other of ['x', 'facebook', undefined]) {
      expect(allDirectives(contribute(pack, input(other)))).toEqual([]);
    }
    for (const { platform: otherPlatform } of PLATFORM_PACKS) {
      if (otherPlatform === platform) continue;
      expect(allDirectives(contribute(pack, input(otherPlatform)))).toEqual([]);
    }
  });
});

describe('platform caption limits', () => {
  it('reads the shared preview limits instead of hard-coding them', () => {
    expect(
      contribute(LINKEDIN_PLATFORM_HARNESS_PACK, input('linkedin')).guardrails,
    ).toContain('Stay within 3000 characters.');
    expect(
      contribute(INSTAGRAM_PLATFORM_HARNESS_PACK, input('instagram'))
        .guardrails,
    ).toContain('Stay within 2200 characters for the caption.');
  });

  it('drops the LinkedIn post limit for long-form articles', () => {
    const article = contribute(
      LINKEDIN_PLATFORM_HARNESS_PACK,
      input('linkedin', 'article'),
    );
    expect(article.guardrails).not.toContain('Stay within 3000 characters.');
    expect(article.styleDirectives?.join(' ')).toMatch(/title under 70/u);
  });
});

describe('format-specific guidance', () => {
  it('adds Reels guidance only for motion formats on Instagram', () => {
    const reel = contribute(
      INSTAGRAM_PLATFORM_HARNESS_PACK,
      input('instagram', 'video'),
    );
    const post = contribute(
      INSTAGRAM_PLATFORM_HARNESS_PACK,
      input('instagram'),
    );
    expect(reel.styleDirectives?.join(' ')).toMatch(/Reels/u);
    expect(post.styleDirectives?.join(' ')).not.toMatch(/Reels/u);
  });

  it('adds Shorts and long-form guidance only for motion formats on YouTube', () => {
    const script = contribute(
      YOUTUBE_PLATFORM_HARNESS_PACK,
      input('youtube', 'video-script'),
    );
    const post = contribute(YOUTUBE_PLATFORM_HARNESS_PACK, input('youtube'));
    expect(script.styleDirectives?.join(' ')).toMatch(/Shorts/u);
    expect(post.styleDirectives?.join(' ')).not.toMatch(/Shorts/u);
  });
});

describe('composed brief', () => {
  function registry(): ContentHarnessRegistry {
    const value = new ContentHarnessRegistry();
    value.registerPack(CORE_CONTENT_HARNESS_PACK);
    value.registerPack(X_PLATFORM_HARNESS_PACK);
    for (const { pack } of PLATFORM_PACKS) {
      value.registerPack(pack);
    }
    return value;
  }

  it.each(PLATFORM_PACKS)(
    'applies only the $platform platform pack',
    async ({ pack, platform }) => {
      const brief = await composeContentHarnessBrief(
        registry(),
        input(platform),
      );
      const appliedPlatformPacks = brief.appliedPacks.filter((id) =>
        id.startsWith('platform-'),
      );
      expect(appliedPlatformPacks).toEqual([pack.id]);
    },
  );

  it('keeps copy platform packs out of the media surface', async () => {
    const brief = await composeContentHarnessBrief(
      registry(),
      input('instagram', 'image'),
      { surface: 'media' },
    );
    expect(brief.packs).not.toContain(INSTAGRAM_PLATFORM_HARNESS_PACK.id);
    expect(brief.appliedPacks).not.toContain(
      INSTAGRAM_PLATFORM_HARNESS_PACK.id,
    );
  });
});
