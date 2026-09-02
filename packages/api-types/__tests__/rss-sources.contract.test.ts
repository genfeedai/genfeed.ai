import {
  parseRssFeed,
  persistRssSourceInputSchema,
  rssItemDedupeKey,
} from '@api-types/contracts/rss-sources.contract';
import { RssImportPolicy } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

const rssXml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Studio</title>
    <item>
      <title>First post</title>
      <link>https://example.com/first</link>
      <guid>https://example.com/first</guid>
      <description>Hello world</description>
      <pubDate>Wed, 27 Aug 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>First post</title>
      <link>https://example.com/first</link>
      <guid>https://example.com/first</guid>
    </item>
  </channel>
</rss>`;

const atomXml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>urn:example:2</id>
    <title>Atom item</title>
    <link href="https://example.com/atom"/>
    <updated>2026-08-27T12:00:00Z</updated>
    <summary>From atom</summary>
  </entry>
</feed>`;

describe('parseRssFeed', () => {
  it('parses RSS 2.0 items and keeps a stable guid', () => {
    const items = parseRssFeed(rssXml);
    expect(items[0]).toMatchObject({
      guid: 'https://example.com/first',
      title: 'First post',
      url: 'https://example.com/first',
    });
  });

  it('decodes CDATA without a backtracking regex', () => {
    const items = parseRssFeed(`<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title><![CDATA[First <post>]]></title>
      <link>https://example.com/cdata</link>
      <guid>https://example.com/cdata</guid>
      <description><![CDATA[Hello <em>world</em>]]></description>
    </item>
  </channel>
</rss>`);

    expect(items[0]).toMatchObject({
      guid: 'https://example.com/cdata',
      summary: 'Hello <em>world</em>',
      title: 'First <post>',
      url: 'https://example.com/cdata',
    });
  });

  it('parses Atom entries', () => {
    const items = parseRssFeed(atomXml);
    expect(items).toEqual([
      {
        guid: 'urn:example:2',
        imageUrl: null,
        publishedAt: '2026-08-27T12:00:00.000Z',
        summary: 'From atom',
        title: 'Atom item',
        url: 'https://example.com/atom',
      },
    ]);
  });

  it('builds a source+guid dedupe key', () => {
    const [item] = parseRssFeed(rssXml);
    expect(rssItemDedupeKey('src-1', item)).toBe(
      'src-1:https://example.com/first',
    );
  });
});

describe('persistRssSourceInputSchema', () => {
  it('rejects an empty target list', () => {
    const parsed = persistRssSourceInputSchema.safeParse({
      feedUrl: 'https://example.com/feed.xml',
      importPolicy: RssImportPolicy.DRAFT,
      label: 'Studio',
      targetChannels: [],
    });
    expect(parsed.success).toBe(false);
  });
});
