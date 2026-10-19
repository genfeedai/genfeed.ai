import { describe, expect, it } from 'vitest';
import { storyboardBriefSourceSchema } from './storyboard-source.contract';

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
