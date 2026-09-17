import { describe, expect, it } from 'vitest';
import { extractRssText } from './extract-source-text.util';

describe('extractRssText', () => {
  it('normalizes RSS items by guid then title and summary', () => {
    const text = extractRssText(`<?xml version="1.0"?>
<rss><channel>
<title>Brand Feed</title>
<item>
  <guid>ep-1</guid>
  <title>First</title>
  <description>Hello</description>
</item>
<item>
  <guid>ep-2</guid>
  <title>Second</title>
  <description>World</description>
</item>
</channel></rss>`);

    expect(text).toContain('Brand Feed');
    expect(text).toContain('ep-1 First Hello');
    expect(text).toContain('ep-2 Second World');
  });

  it('rejects non-feed XML and oversized feeds', () => {
    expect(() =>
      extractRssText('<html><body>Not a feed</body></html>'),
    ).toThrow('not a valid RSS or Atom feed');
    const items = Array.from({ length: 201 }, (_, index) => {
      return `<item><guid>${index}</guid><title>T</title><description>D</description></item>`;
    }).join('');
    expect(() =>
      extractRssText(
        `<rss><channel><title>Too big</title>${items}</channel></rss>`,
      ),
    ).toThrow('200-entry');
  });
});
