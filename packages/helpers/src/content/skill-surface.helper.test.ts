import { ContentSkillCategory, SkillSurface } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import {
  isSkillOnSurface,
  isSkillSurface,
  parseSkillSurface,
  resolveSkillSurfaces,
} from './skill-surface.helper';

describe('resolveSkillSurfaces', () => {
  it('offers every skill on the agent surface', () => {
    expect(resolveSkillSurfaces({})).toEqual([SkillSurface.AGENT]);
  });

  it('adds studio for a skill that shapes a generated asset', () => {
    expect(
      resolveSkillSurfaces({
        category: ContentSkillCategory.IMAGE,
        modalities: ['image'],
        workflowStage: 'creation',
      }),
    ).toEqual([SkillSurface.AGENT, SkillSurface.STUDIO]);
  });

  it('treats a multi-modality skill as a studio skill too', () => {
    expect(
      resolveSkillSurfaces({ modalities: ['multi', 'text', 'video'] }),
    ).toContain(SkillSurface.STUDIO);
  });

  it('keeps a text-only writing skill off studio', () => {
    expect(
      resolveSkillSurfaces({
        category: ContentSkillCategory.WRITING,
        modalities: ['text'],
        workflowStage: 'creation',
      }),
    ).toEqual([SkillSurface.AGENT]);
  });

  it('keeps a media skill that only reasons about work off studio', () => {
    // An ad-performance analyser is tagged image, but there is nothing for a
    // Studio composer to do with it.
    expect(
      resolveSkillSurfaces({
        category: ContentSkillCategory.ANALYTICS,
        modalities: ['image'],
        workflowStage: 'analysis',
      }),
    ).toEqual([SkillSurface.AGENT]);
  });

  it('honours an explicit persisted surface list over inference', () => {
    expect(
      resolveSkillSurfaces({
        category: ContentSkillCategory.IMAGE,
        modalities: ['image'],
        surfaces: ['agent'],
      }),
    ).toEqual([SkillSurface.AGENT]);
  });

  it('falls back to inference when the persisted list is unusable', () => {
    expect(
      resolveSkillSurfaces({ modalities: ['image'], surfaces: ['nonsense'] }),
    ).toEqual([SkillSurface.AGENT, SkillSurface.STUDIO]);
  });

  it('de-duplicates a repeated persisted surface', () => {
    expect(
      resolveSkillSurfaces({ surfaces: ['studio', 'studio', 'agent'] }),
    ).toEqual([SkillSurface.STUDIO, SkillSurface.AGENT]);
  });

  it('tolerates null taxonomy fields from a partially tagged custom skill', () => {
    expect(
      resolveSkillSurfaces({
        category: null,
        modalities: null,
        surfaces: null,
        workflowStage: null,
      }),
    ).toEqual([SkillSurface.AGENT]);
  });
});

describe('isSkillOnSurface', () => {
  it('matches the surface the skill resolves to', () => {
    const skill = { modalities: ['video'], workflowStage: 'creation' };

    expect(isSkillOnSurface(skill, SkillSurface.STUDIO)).toBe(true);
    expect(isSkillOnSurface(skill, SkillSurface.AGENT)).toBe(true);
  });

  it('rejects a surface the skill is not offered on', () => {
    expect(
      isSkillOnSurface({ modalities: ['text'] }, SkillSurface.STUDIO),
    ).toBe(false);
  });
});

describe('parseSkillSurface', () => {
  it('accepts a known surface', () => {
    expect(parseSkillSurface('studio')).toBe(SkillSurface.STUDIO);
    expect(isSkillSurface('agent')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(parseSkillSurface('publishing')).toBeNull();
    expect(parseSkillSurface(undefined)).toBeNull();
    expect(isSkillSurface('')).toBe(false);
  });
});
