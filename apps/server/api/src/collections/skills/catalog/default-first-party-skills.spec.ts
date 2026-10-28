import { AgentType } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FIRST_PARTY_SKILL_SLUGS,
  isDefaultFirstPartySkillSlug,
  resolveDefaultFirstPartySkillSlugs,
} from './default-first-party-skills';

describe('resolveDefaultFirstPartySkillSlugs', () => {
  it('packs image-prompt-engineer and model-selector for image generation', () => {
    expect(
      resolveDefaultFirstPartySkillSlugs({
        agentType: AgentType.IMAGE_CREATOR,
        modality: 'image',
      }),
    ).toEqual(['image-prompt-engineer', 'model-selector']);
  });

  it('gives the video agent the clip editor beside its prompting skills', () => {
    expect(
      resolveDefaultFirstPartySkillSlugs({
        agentType: AgentType.VIDEO_CREATOR,
        modality: 'video',
      }),
    ).toEqual(['model-selector', 'image-prompt-engineer', 'clip-editor']);
  });

  it.each([
    'x',
    'twitter',
    'linkedin',
    'instagram',
    'reels',
    'tiktok',
    'youtube',
    'shorts',
  ])(
    'injects no skill on the %s channel, which a harness platform pack covers',
    (channel) => {
      expect(resolveDefaultFirstPartySkillSlugs({ channel })).toEqual([]);
      expect(
        resolveDefaultFirstPartySkillSlugs({ channel, modality: 'text' }),
      ).toEqual([]);
    },
  );

  it('keeps agent-type defaults on a harness platform channel', () => {
    expect(
      resolveDefaultFirstPartySkillSlugs({
        agentType: AgentType.X_CONTENT,
        channel: 'x',
      }),
    ).toEqual(['x-content-creator']);
  });

  it('unions agent-type and channel defaults without dumping the catalog', () => {
    expect(
      resolveDefaultFirstPartySkillSlugs({
        agentType: AgentType.IMAGE_CREATOR,
        channel: 'blog',
        modality: 'image',
      }),
    ).toEqual([
      'image-prompt-engineer',
      'model-selector',
      'blog-content-creator',
    ]);
  });

  it('no longer reports tiktok-warmup as a default writing skill', () => {
    expect(isDefaultFirstPartySkillSlug('tiktok-warmup')).toBe(false);
  });

  it('falls back to content-writing when no context is available', () => {
    expect(resolveDefaultFirstPartySkillSlugs({})).toEqual(['content-writing']);
  });

  it('reports every context default as part of the default set', () => {
    for (const context of [
      {},
      { agentType: AgentType.IMAGE_CREATOR, modality: 'image' },
      { agentType: AgentType.VIDEO_CREATOR, modality: 'video' },
      { channel: 'blog' },
      { modality: 'audio' },
    ]) {
      for (const slug of resolveDefaultFirstPartySkillSlugs(context)) {
        expect(DEFAULT_FIRST_PARTY_SKILL_SLUGS).toContain(slug);
        expect(isDefaultFirstPartySkillSlug(slug)).toBe(true);
      }
    }
    expect(isDefaultFirstPartySkillSlug('hook-writer')).toBe(false);
  });
});
