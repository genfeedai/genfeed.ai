import { describe, expect, it } from 'vitest';
import { B2B_MEDIA_CRAFT_HARNESS_PACK } from '../src/b2b-media-craft';
import { composeContentHarnessBrief } from '../src/compose';
import { CORE_CONTENT_HARNESS_PACK } from '../src/defaults';
import { buildMediaPromptFromHarness } from '../src/media-prompt';
import { ContentHarnessRegistry } from '../src/registry';
import type { ContentHarnessInput, ContentKind } from '../src/types';

function registry(): ContentHarnessRegistry {
  const packs = new ContentHarnessRegistry();
  packs.registerPack(CORE_CONTENT_HARNESS_PACK);
  packs.registerPack(B2B_MEDIA_CRAFT_HARNESS_PACK);
  return packs;
}

function input(
  contentType: ContentKind,
  topic = 'How team leaders cut reporting time with the dashboard',
): ContentHarnessInput {
  return {
    brandName: 'Acme',
    intent: { contentType, objective: 'awareness', topic },
  };
}

describe('B2B_MEDIA_CRAFT_HARNESS_PACK', () => {
  it('is a media-surface pack', () => {
    expect(B2B_MEDIA_CRAFT_HARNESS_PACK.id).toBe('b2b-media-craft');
    expect(B2B_MEDIA_CRAFT_HARNESS_PACK.surfaces).toEqual(['media']);
  });

  it.each(['video', 'ugc'] as const)(
    'gives a %s brief the action-arc and product-anchor directives',
    async (contentType) => {
      const brief = await composeContentHarnessBrief(
        registry(),
        input(contentType),
        { surface: 'media' },
      );

      expect(brief.appliedPacks).toContain('b2b-media-craft');
      expect(brief.styleDirectives.join(' ')).toContain('one camera move');
      expect(brief.guardrails.join(' ')).toContain('Do not invent logos');
      expect(brief.guardrails.join(' ')).toContain('Render no text');
    },
  );

  it.each(['image', 'ad-creative'] as const)(
    'gives an %s brief a still-frame anchor instead of camera direction',
    async (contentType) => {
      const brief = await composeContentHarnessBrief(
        registry(),
        input(contentType),
        { surface: 'media' },
      );

      expect(brief.appliedPacks).toContain('b2b-media-craft');
      expect(brief.styleDirectives.join(' ')).toContain('real product view');
      expect(brief.styleDirectives.join(' ')).not.toContain('camera move');
    },
  );

  it('reads the audience from the voice profile as well as the topic', async () => {
    const brief = await composeContentHarnessBrief(
      registry(),
      {
        ...input('video', 'Product tour'),
        voiceProfile: { audience: ['SaaS founders'] },
      },
      { surface: 'media' },
    );

    expect(brief.appliedPacks).toContain('b2b-media-craft');
  });

  it('stays out of a consumer brief', async () => {
    const brief = await composeContentHarnessBrief(
      registry(),
      input('video', 'Sunrise run in our new sneakers'),
      { surface: 'media' },
    );

    expect(brief.appliedPacks).not.toContain('b2b-media-craft');
  });

  it('never reaches the copy surface or music', async () => {
    const copy = await composeContentHarnessBrief(registry(), input('post'), {
      surface: 'copy',
    });
    const music = await composeContentHarnessBrief(registry(), input('music'), {
      surface: 'media',
    });

    expect(copy.packs).not.toContain('b2b-media-craft');
    expect(music.appliedPacks).not.toContain('b2b-media-craft');
  });

  it('reaches the provider prompt as a brand look', async () => {
    const brief = await composeContentHarnessBrief(registry(), input('video'), {
      surface: 'media',
    });

    const prompt = buildMediaPromptFromHarness('A product tour', brief);

    expect(prompt).toContain('A product tour');
    expect(prompt).toContain('one camera move');
    expect(prompt).toContain('Do not invent logos');
  });
});
