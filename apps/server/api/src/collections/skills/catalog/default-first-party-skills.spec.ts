import { MAX_INSTRUCTIONS_PER_SKILL } from '@api/services/skill-runtime/skill-runtime.service';
import { AgentType } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIRST_PARTY_SKILL_SLUGS,
  isDefaultFirstPartySkillSlug,
  resolveDefaultFirstPartySkillSlugs,
} from './default-first-party-skills';
import { loadFirstPartySkillDefinitions } from './first-party-skill-loader';

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
    ).toEqual(['model-selector', 'cinematic-prompting', 'clip-editor']);
  });

  it.each([
    ['audio', ['model-selector']],
    ['image', ['image-prompt-engineer', 'model-selector']],
    ['video', ['model-selector', 'cinematic-prompting']],
  ])('pins the %s modality defaults', (modality, expected) => {
    expect(resolveDefaultFirstPartySkillSlugs({ modality })).toEqual(expected);
  });

  it('never steers a video prompt with the image prompt skill', () => {
    expect(
      resolveDefaultFirstPartySkillSlugs({ modality: 'video' }),
    ).not.toContain('image-prompt-engineer');
    expect(
      resolveDefaultFirstPartySkillSlugs({
        agentType: AgentType.VIDEO_CREATOR,
        modality: 'video',
      }),
    ).not.toContain('image-prompt-engineer');
  });

  it('gives the AI avatar agent the clip editor, since it can edit clips too', () => {
    expect(
      resolveDefaultFirstPartySkillSlugs({ agentType: AgentType.AI_AVATAR }),
    ).toContain('clip-editor');
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
    ).toEqual(['x-post', 'x-thread']);
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

  it.each([
    ['video', ['model-selector', 'cinematic-prompting']],
    ['audio', ['model-selector']],
  ])(
    'ships every %s default in the catalog and under the per-skill limit',
    (modality, slugs) => {
      const catalog = loadFirstPartySkillDefinitions();
      for (const slug of slugs) {
        const skill = catalog.find((definition) => definition.slug === slug);
        expect(skill?.instructions.length).toBeGreaterThan(0);
        expect(skill?.instructions.length).toBeLessThanOrEqual(
          MAX_INSTRUCTIONS_PER_SKILL,
        );
      }
      expect(resolveDefaultFirstPartySkillSlugs({ modality })).toEqual(slugs);
    },
  );

  it('carries the video skills of the pinned skills repository', () => {
    const slugs = loadFirstPartySkillDefinitions().map(
      (definition) => definition.slug,
    );
    expect(slugs).toContain('motion-video');
    expect(slugs).toContain('video-brand-profile');
  });
});
