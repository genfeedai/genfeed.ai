import { describe, expect, it } from 'vitest';

import {
  buildTrendDigestHtml,
  buildTrendDigestMessage,
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

  it('honors a custom header title', () => {
    const message = buildTrendDigestMessage(sampleTrends, {
      headerTitle: 'Daily Trends',
      minViralScore: 50,
    });
    expect(message).toContain('*Daily Trends*');
  });
});

describe('buildTrendDigestHtml', () => {
  it('renders sections, escapes content, and links the footer when appUrl is set', () => {
    const html = buildTrendDigestHtml(sampleTrends, {
      appUrl: 'https://app.genfeed.ai',
      minViralScore: 70,
    });
    expect(html).toContain('Viral Videos');
    expect(html).toContain('Trending Hashtags');
    expect(html).toContain('Trending Sounds');
    expect(html).toContain('Score: 92');
    expect(html).toContain('1.5M views');
    expect(html).toContain('href="https://app.genfeed.ai"');
    expect(html).toContain('Open Genfeed');
  });

  it('omits the footer link when appUrl is empty', () => {
    const html = buildTrendDigestHtml(sampleTrends, { minViralScore: 70 });
    expect(html).not.toContain('<a href=');
  });

  it('renders an empty digest without crashing', () => {
    const html = buildTrendDigestHtml([], { minViralScore: 70 });
    expect(html).toContain('Your Trend Summary');
    expect(html).not.toContain('Viral Videos');
  });
});
