import { inferFirstPartySkillTaxonomy } from '@api/collections/skills/catalog/first-party-skill-taxonomy';
import { ContentSkillCategory } from '@genfeedai/enums';
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
});
