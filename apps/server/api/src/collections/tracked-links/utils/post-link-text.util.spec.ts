import {
  extractPostUrls,
  replacePostUrls,
} from '@api/collections/tracked-links/utils/post-link-text.util';

describe('post link text', () => {
  it('extracts unique URLs without trailing punctuation', () => {
    const text =
      'Episode: https://youtu.be/abc, podcast (https://example.com/p?x=1). Again https://youtu.be/abc!';

    expect(extractPostUrls(text)).toEqual([
      'https://youtu.be/abc',
      'https://example.com/p?x=1',
    ]);
  });

  it('returns nothing for text without URLs', () => {
    expect(extractPostUrls('No links here, only www.example.com')).toEqual([]);
  });

  it('replaces mapped URLs, keeps punctuation and leaves unmapped URLs', () => {
    const text = '📺 https://youtu.be/abc.\n🎧 https://example.com/p, link';
    const replacements = new Map([['https://youtu.be/abc', 'https://go.x/1']]);

    expect(replacePostUrls(text, replacements)).toBe(
      '📺 https://go.x/1.\n🎧 https://example.com/p, link',
    );
  });

  it('replaces every occurrence of a repeated URL', () => {
    const replacements = new Map([['https://a.com', 'https://go.x/1']]);

    expect(
      replacePostUrls('https://a.com and https://a.com', replacements),
    ).toBe('https://go.x/1 and https://go.x/1');
  });
});
