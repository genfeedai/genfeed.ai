import {
  ContentRunSource,
  ContentRunStatus,
  ContentSkillCategory,
} from '../src/content-skill.enum';

describe('ContentSkill enums', () => {
  it('defines all content skill categories', () => {
    expect(Object.values(ContentSkillCategory)).toEqual([
      'writing',
      'image',
      'video',
      'audio',
      'discovery',
      'distribution',
      'analytics',
      'optimization',
    ]);
  });

  it('defines content run statuses', () => {
    expect(Object.values(ContentRunStatus)).toEqual([
      'pending',
      'running',
      'completed',
      'failed',
    ]);
  });

  it('defines content run sources', () => {
    expect(Object.values(ContentRunSource)).toEqual(['byok', 'hosted']);
  });
});
