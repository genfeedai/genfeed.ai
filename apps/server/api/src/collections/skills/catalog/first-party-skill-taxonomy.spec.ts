import { inferFirstPartySkillTaxonomy } from '@api/collections/skills/catalog/first-party-skill-taxonomy';
import { ContentSkillCategory, SkillSurface } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('inferFirstPartySkillTaxonomy', () => {
  it('maps instagram-content-creator to instagram text creation', () => {
    expect(
      inferFirstPartySkillTaxonomy('instagram-content-creator', {
        outputs: ['text'],
        tags: ['instagram', 'content-creation'],
      }),
    ).toMatchObject({
      category: ContentSkillCategory.WRITING,
      channels: ['instagram'],
      modalities: ['text'],
      workflowStage: 'creation',
    });
  });

  it('maps image-prompt-engineer to image creation even when outputs are text', () => {
    expect(
      inferFirstPartySkillTaxonomy('image-prompt-engineer', {
        outputs: ['text'],
        tags: ['image-generation', 'prompt-engineering'],
      }),
    ).toMatchObject({
      category: ContentSkillCategory.IMAGE,
      modalities: ['image'],
      workflowStage: 'creation',
    });
  });

  it('maps warmup skills to publishing / distribution', () => {
    expect(inferFirstPartySkillTaxonomy('x-warmup')).toMatchObject({
      category: ContentSkillCategory.DISTRIBUTION,
      channels: ['x'],
      workflowStage: 'publishing',
    });
  });

  it('offers a prompt-engineering skill on both composer surfaces', () => {
    expect(
      inferFirstPartySkillTaxonomy('image-prompt-engineer', {
        outputs: ['text'],
        tags: ['image-generation', 'prompt-engineering'],
      }).surfaces,
    ).toEqual([SkillSurface.AGENT, SkillSurface.STUDIO]);
  });

  it('keeps a writing skill on the agent surface only', () => {
    expect(
      inferFirstPartySkillTaxonomy('linkedin-content-creator', {
        outputs: ['text'],
        tags: ['linkedin', 'content-creation'],
      }).surfaces,
    ).toEqual([SkillSurface.AGENT]);
  });

  it('reads "brand voice" as tone, not as audio', () => {
    // Otherwise a voice-and-tone skill lands in Studio as an audio generator.
    const taxonomy = inferFirstPartySkillTaxonomy('brand-interview', {
      outputs: ['text'],
      tags: ['brand', 'voice', 'interview', 'strategy'],
    });

    expect(taxonomy.modalities).toEqual(['text']);
    expect(taxonomy.surfaces).toEqual([SkillSurface.AGENT]);
    expect(taxonomy.workflowStage).toBe('planning');
  });

  it('still reads an explicit audio tag as audio', () => {
    expect(
      inferFirstPartySkillTaxonomy('voiceover-writer', {
        tags: ['voiceover', 'audio'],
      }).modalities,
    ).toContain('audio');
  });
});
