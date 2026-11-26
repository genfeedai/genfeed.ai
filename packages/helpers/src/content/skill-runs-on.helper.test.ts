import { SkillRunsOn } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import {
  inferSkillRunsOn,
  isSkillRunsOn,
  resolveSkillRunsOn,
} from './skill-runs-on.helper';

describe('inferSkillRunsOn', () => {
  it.each([
    [['video', 'local'], SkillRunsOn.DESKTOP],
    [['video', 'remotion'], SkillRunsOn.WEB],
    [[], SkillRunsOn.WEB],
  ])('maps tags %j to %s', (tags, expected) => {
    expect(inferSkillRunsOn(tags)).toBe(expected);
  });
});

describe('resolveSkillRunsOn', () => {
  it.each([
    [{ runsOn: 'desktop' }, SkillRunsOn.DESKTOP],
    [{ runsOn: 'web' }, SkillRunsOn.WEB],
    [{}, SkillRunsOn.WEB],
    [{ runsOn: null }, SkillRunsOn.WEB],
    [{ runsOn: 'mainframe' }, SkillRunsOn.WEB],
  ])('resolves %j to %s', (skill, expected) => {
    expect(resolveSkillRunsOn(skill)).toBe(expected);
  });
});

describe('isSkillRunsOn', () => {
  it('accepts only the two known values', () => {
    expect(isSkillRunsOn('desktop')).toBe(true);
    expect(isSkillRunsOn('web')).toBe(true);
    expect(isSkillRunsOn('studio')).toBe(false);
  });
});
