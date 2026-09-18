import { describe, expect, it } from 'vitest';

import { extractRequestedSkillSlugs } from './prompt-command.helper';

const SLUGS = ['brand-interview', 'cinematic-prompting', 'model-selector'];

describe('extractRequestedSkillSlugs', () => {
  it('returns the prompt untouched when nothing was picked', () => {
    expect(extractRequestedSkillSlugs('write me a post', SLUGS)).toEqual({
      content: 'write me a post',
      skillSlugs: [],
    });
  });

  it('strips a picked skill off the front of the prompt', () => {
    expect(
      extractRequestedSkillSlugs('/brand-interview grill me on voice', SLUGS),
    ).toEqual({
      content: 'grill me on voice',
      skillSlugs: ['brand-interview'],
    });
  });

  it('collects several picked skills in the order they were typed', () => {
    expect(
      extractRequestedSkillSlugs(
        '/model-selector /cinematic-prompting a slow dolly in',
        SLUGS,
      ),
    ).toEqual({
      content: 'a slow dolly in',
      skillSlugs: ['model-selector', 'cinematic-prompting'],
    });
  });

  it('does not repeat a slug picked twice', () => {
    expect(
      extractRequestedSkillSlugs(
        '/model-selector /model-selector pick one',
        SLUGS,
      ).skillSlugs,
    ).toEqual(['model-selector']);
  });

  it('leaves an unknown slash command in the prompt for the action parser', () => {
    // `/create` is a composer action, not a skill — stripping it here would
    // break navigation.
    expect(extractRequestedSkillSlugs('/create a launch post', SLUGS)).toEqual({
      content: '/create a launch post',
      skillSlugs: [],
    });
  });

  it('stops at the first token that is not a picked skill', () => {
    expect(
      extractRequestedSkillSlugs('/brand-interview /create later', SLUGS),
    ).toEqual({
      content: '/create later',
      skillSlugs: ['brand-interview'],
    });
  });

  it('only reads tokens at the front, never mid-prompt', () => {
    expect(
      extractRequestedSkillSlugs('write about /brand-interview', SLUGS),
    ).toEqual({
      content: 'write about /brand-interview',
      skillSlugs: [],
    });
  });

  it('matches a slug case-insensitively', () => {
    expect(
      extractRequestedSkillSlugs('/Brand-Interview go', SLUGS).skillSlugs,
    ).toEqual(['brand-interview']);
  });

  it('reports a lone skill pick with empty content so the caller can prompt', () => {
    expect(extractRequestedSkillSlugs('/brand-interview', SLUGS)).toEqual({
      content: '',
      skillSlugs: ['brand-interview'],
    });
  });

  it('recognises nothing when the palette offered no skills', () => {
    expect(extractRequestedSkillSlugs('/brand-interview go', [])).toEqual({
      content: '/brand-interview go',
      skillSlugs: [],
    });
  });

  it('handles an empty prompt', () => {
    expect(extractRequestedSkillSlugs('   ', SLUGS)).toEqual({
      content: '',
      skillSlugs: [],
    });
  });
});
