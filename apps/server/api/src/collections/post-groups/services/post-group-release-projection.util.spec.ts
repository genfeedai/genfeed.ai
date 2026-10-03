import { deriveReleaseTitle } from '@api/collections/post-groups/services/post-group-release-projection.util';

describe('deriveReleaseTitle', () => {
  it('flattens editor HTML content into a plain-text title', () => {
    expect(
      deriveReleaseTitle(
        null,
        '<p>AI content is taking over! <strong>Manual</strong> content&nbsp;&amp; more</p>',
      ),
    ).toBe('AI content is taking over! Manual content & more');
  });

  it('prefers the label and truncates long content', () => {
    expect(deriveReleaseTitle(' <b>Launch</b> ', '<p>Body</p>')).toBe('Launch');
    const title = deriveReleaseTitle(undefined, `<p>${'word '.repeat(40)}</p>`);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith('...')).toBe(true);
  });

  it('falls back to Untitled post when nothing readable remains', () => {
    expect(deriveReleaseTitle('', '<p> </p>')).toBe('Untitled post');
  });
});
