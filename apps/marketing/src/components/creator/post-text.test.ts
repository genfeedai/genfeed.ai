import { describe, expect, it } from 'vitest';
import { postPlatformLabel, postTitle, toPlainPostText } from './post-text';

describe('post-text', () => {
  it('flattens editor HTML into one line of text', () => {
    expect(toPlainPostText('<p>Ship it.</p>\n<p>Today.</p>')).toBe(
      'Ship it. Today.',
    );
  });

  it.each([
    ['twitter', 'X'],
    ['YOUTUBE', 'YouTube'],
    ['unknown', null],
    [undefined, null],
  ])('labels platform %j as %j', (platform, expected) => {
    expect(postPlatformLabel(platform)).toBe(expected);
  });

  it('prefers the label, then clips the copy on a word boundary', () => {
    expect(postTitle(' Launch ', 'ignored')).toBe('Launch');
    expect(postTitle(undefined, 'Short copy')).toBe('Short copy');
    expect(
      postTitle(
        undefined,
        'Every brand needs a home for its work, and a profile on Genfeed is that home for articles, posts and media.',
      ),
    ).toBe(
      'Every brand needs a home for its work, and a profile on Genfeed is that home…',
    );
  });
});
