import { describe, expect, it } from 'vitest';

import {
  buildTrendDigestHtml,
  buildTrendDigestMessage,
  buildTrendDigestSubject,
  escapeTrendHtml,
  formatTrendCount,
  type TrendDigestItem,
} from './trend-digest.helper';

const sampleTrends: TrendDigestItem[] = [
  {
    platform: 'tiktok',
    topic: 'Dancing cats',
    type: 'video',
    url: 'https://example.com/v',
    usageCount: 1_500_000,
    viralScore: 92,
  },
  {
    platform: 'instagram',
    topic: '#trendingnow',
    type: 'hashtag',
    usageCount: 23_400,
    viralScore: 81,
  },
  {
    platform: 'tiktok',
    topic: 'Catchy hook',
    type: 'sound',
    usageCount: 12_000,
    viralScore: 80,
  },
];

describe('formatTrendCount', () => {
  it('formats millions', () => {
    expect(formatTrendCount(1_500_000)).toBe('1.5M');
  });

  it('formats thousands', () => {
    expect(formatTrendCount(23_400)).toBe('23.4K');
  });

  it('leaves small numbers untouched', () => {
    expect(formatTrendCount(942)).toBe('942');
  });
});

describe('escapeTrendHtml', () => {
  it('escapes html-sensitive characters', () => {
    expect(escapeTrendHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('buildTrendDigestMessage', () => {
  it('groups trends by type and includes the threshold', () => {
    const message = buildTrendDigestMessage(sampleTrends, {
      minViralScore: 70,
    });
    expect(message).toContain('viral score >= 70');
    expect(message).toContain('Viral Videos:');
    expect(message).toContain('Trending Hashtags:');
    expect(message).toContain('Trending Sounds:');
    // hashtags/sounds render usageCount in the message; videos render score
    expect(message).toContain('23.4K posts');
    expect(message).toContain('score: 92');
  });

  it('lists topic-corpus rows with their mention count', () => {
    const message = buildTrendDigestMessage(
      [
        {
          platform: 'youtube',
          topic: 'Launch thread',
          type: 'topic',
          usageCount: 2_400,
          viralScore: 88,
        },
      ],
      { minViralScore: 70 },
    );

    expect(message).toContain('Trending Topics:');
    expect(message).toContain('Launch thread (youtube, score: 88)');
    expect(message).toContain('2.4K mentions');
  });

  it('honors a custom header title', () => {
    const message = buildTrendDigestMessage(sampleTrends, {
      headerTitle: 'Daily Trends',
      minViralScore: 50,
    });
    expect(message).toContain('*Daily Trends*');
  });
});

const leadTrend: TrendDigestItem = {
  angle: 'Your buyers compare AI and studio output.',
  matchedTerms: ['ai video', 'ugc'],
  platform: 'tiktok',
  postIdea: {
    caption: 'Left: two days. Right: four minutes.',
    format: 'Video · 30s',
    hook: 'We made the same ad twice.',
  },
  thumbnailUrl: 'https://img.example.com/lead.jpg',
  topic: 'AI UGC ads beat studio shoots',
  type: 'video',
  url: 'https://tiktok.com/@a/video/1',
  usageCount: 2_400_000,
  viralScore: 100,
};

const postTrend: TrendDigestItem = {
  platform: 'twitter',
  posts: [
    {
      authorHandle: '@lenabuilds',
      likes: 4200,
      platform: 'twitter',
      text: 'Two open video models now beat the paid tool I used in January.',
      url: 'https://x.com/lenabuilds/status/1',
    },
  ],
  postIdea: {
    caption: 'The stack and what a clip costs.',
    format: 'Thread · 5 posts',
    hook: 'Run a full AI studio on your own server.',
  },
  topic: 'Open source video models close the gap',
  type: 'topic',
  viralScore: 90,
};

describe('buildTrendDigestHtml', () => {
  it('leads with the top topic: thumbnail, angle, matched terms and post idea', () => {
    const html = buildTrendDigestHtml([leadTrend, postTrend], {
      appUrl: 'https://app.genfeed.ai',
      brandLabel: 'Genfeed',
      minViralScore: 70,
    });

    expect(html).toContain('Lead story');
    expect(html).toContain('src="https://img.example.com/lead.jpg"');
    expect(html).toContain('alt="AI UGC ads beat studio shoots"');
    expect(html).toContain('Your buyers compare AI and studio output.');
    expect(html).toContain('ai video');
    expect(html).toContain('We made the same ad twice.');
    expect(html).toContain('2.4M views');
    expect(html).toContain('2 topics moving in the Genfeed niche');
  });

  it('lists drafts ready to post, then the other topics with the post as a card', () => {
    const html = buildTrendDigestHtml([leadTrend, postTrend], {
      minViralScore: 70,
    });

    expect(html).toContain('Ready to post today');
    expect(html).toContain('Also moving in your niche');
    expect(html).toContain('@lenabuilds');
    expect(html).toContain('Two open video models now beat the paid tool');
    expect(html).toContain('4.2K likes');
    expect(html).toContain('href="https://x.com/lenabuilds/status/1"');
  });

  it('never prints a score badge', () => {
    const html = buildTrendDigestHtml([leadTrend], { minViralScore: 70 });

    expect(html).not.toContain('Score:');
  });

  it('drops a thumbnail that is not an http(s) image', () => {
    const html = buildTrendDigestHtml(
      [{ ...leadTrend, thumbnailUrl: 'javascript:alert(1)' }],
      { minViralScore: 70 },
    );

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<img src="javascript');
    expect(html).toContain('AI UGC ads beat studio shoots');
  });

  it('escapes scraped post text', () => {
    const html = buildTrendDigestHtml(
      [
        leadTrend,
        {
          ...postTrend,
          posts: [
            {
              platform: 'twitter',
              text: '<script>alert(1)</script>',
              url: 'https://x.com/a/status/2',
            },
          ],
        },
      ],
      { minViralScore: 70 },
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops a row link that is not a safe http(s) target', () => {
    const html = buildTrendDigestHtml(
      [{ ...leadTrend, url: 'mailto:someone@example.com' }],
      { minViralScore: 70 },
    );

    expect(html).not.toContain('mailto:');
    expect(html).toContain('AI UGC ads beat studio shoots');
  });

  it('renders rows without ideas or media, for callers that only have scores', () => {
    const html = buildTrendDigestHtml(sampleTrends, { minViralScore: 70 });

    expect(html).toContain('Dancing cats');
    expect(html).toContain('1.5M views');
    expect(html).not.toContain('Ready to post today');
  });

  it('links the footer when appUrl is set and omits it when empty', () => {
    const withUrl = buildTrendDigestHtml([leadTrend], {
      appUrl: 'https://app.genfeed.ai',
      minViralScore: 70,
    });
    const withoutUrl = buildTrendDigestHtml(
      [{ ...leadTrend, thumbnailUrl: undefined, url: undefined }],
      { appUrl: '', minViralScore: 70 },
    );

    expect(withUrl).toContain('href="https://app.genfeed.ai"');
    expect(withUrl).toContain('Open Genfeed');
    expect(withoutUrl).not.toContain('<a href=');
  });

  it('renders an empty digest without crashing', () => {
    const html = buildTrendDigestHtml([], { minViralScore: 70 });

    expect(html).toContain('Your Trend Summary');
    expect(html).not.toContain('Lead story');
  });
});

describe('buildTrendDigestSubject', () => {
  it.each([
    [
      [leadTrend, postTrend],
      '2 posts ready for today, from 2 topics in your niche',
    ],
    [[leadTrend], '1 post ready for today, from 1 topic in your niche'],
    [[sampleTrends[0]], 'Your daily trends — 1 topic'],
  ])('writes %#', (trends, expected) => {
    expect(buildTrendDigestSubject(trends)).toBe(expected);
  });
});
