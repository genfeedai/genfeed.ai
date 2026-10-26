import { describe, expect, it } from 'vitest';
import {
  STORYBOARD_LONG_BRIEF_MAX_CHARACTERS,
  STORYBOARD_SHORT_BRIEF_MAX_CHARACTERS,
  storyboardBriefSourceSchema,
} from './storyboard-source.contract';

describe('storyboardBriefSourceSchema author', () => {
  it('keeps who wrote an agent brief', () => {
    for (const author of ['agent', 'agent_edited'] as const) {
      expect(
        storyboardBriefSourceSchema.parse({
          author,
          brief: 'A founder unboxes the spring drop.',
          kind: 'brief',
        }),
      ).toEqual({
        author,
        brief: 'A founder unboxes the spring drop.',
        kind: 'brief',
      });
    }
  });

  it('leaves a member-written brief without an author', () => {
    expect(
      storyboardBriefSourceSchema.parse({ brief: 'My story', kind: 'brief' }),
    ).not.toHaveProperty('author');
  });

  it('rejects an unknown author', () => {
    expect(
      storyboardBriefSourceSchema.safeParse({
        author: 'human',
        brief: 'My story',
        kind: 'brief',
      }).success,
    ).toBe(false);
  });
});

describe('storyboardBriefSourceSchema length', () => {
  const longBrief = 'a'.repeat(STORYBOARD_SHORT_BRIEF_MAX_CHARACTERS + 1);

  it('keeps short briefs at the short limit', () => {
    expect(
      storyboardBriefSourceSchema.safeParse({ brief: longBrief, kind: 'brief' })
        .success,
    ).toBe(false);
  });

  it('accepts a long transcript for a long-form storyboard', () => {
    expect(
      storyboardBriefSourceSchema.safeParse({
        brief: longBrief,
        kind: 'brief',
        length: 'long_form',
      }).success,
    ).toBe(true);
  });

  it('caps long-form briefs', () => {
    expect(
      storyboardBriefSourceSchema.safeParse({
        brief: 'a'.repeat(STORYBOARD_LONG_BRIEF_MAX_CHARACTERS + 1),
        kind: 'brief',
        length: 'long_form',
      }).success,
    ).toBe(false);
  });
});
