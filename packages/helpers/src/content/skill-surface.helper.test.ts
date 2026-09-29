import { ContentSkillCategory, SkillSurface } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import {
  isSkillOnSurface,
  isSkillSurface,
  parseSkillSurface,
  resolveSkillSurfaces,
} from './skill-surface.helper';

describe('resolveSkillSurfaces', () => {
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
