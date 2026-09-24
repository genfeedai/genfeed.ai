import {
  buildLinkedInLiveTrendTopics,
  resolveLinkedInTrendSourceUrls,
} from '@api/services/integrations/linkedin/utils/linkedin-trend.util';

describe('LinkedIn trend derivation', () => {
  it('preserves configured source order and falls back for unusable config', () => {
    expect(
      resolveLinkedInTrendSourceUrls(
        ' https://www.linkedin.com/company/openai/ , , https://www.linkedin.com/company/stripe/ ',
      ),
    ).toEqual([
      'https://www.linkedin.com/company/openai/',
      'https://www.linkedin.com/company/stripe/',
    ]);

    expect(resolveLinkedInTrendSourceUrls(undefined)).toContain(
      'https://www.linkedin.com/company/openai/',
    );
    expect(resolveLinkedInTrendSourceUrls(' , ')).toContain(
      'https://www.linkedin.com/company/openai/',
    );
  });

  it('derives weighted live topics from fulfilled public scrape results', () => {
    const topics = buildLinkedInLiveTrendTopics([
      {
        status: 'fulfilled',
        value: {
          logoUrl: 'https://cdn.example/openai.png',
          recentPosts: [
            'Strong momentum around #AI and enterprise adoption.',
            'Builders are shipping new #AI workflows.',
          ],
          sourceUrl: 'https://www.linkedin.com/company/openai/',
        },
      },
      {
        status: 'fulfilled',
        value: {
          recentPosts: ['Teams keep investing in #AI platforms.'],
          sourceUrl: 'https://www.linkedin.com/company/stripe/',
        },
      },
      { reason: new Error('scrape failed'), status: 'rejected' },
    ]);

    expect(topics[0]).toMatchObject({
      growthRate: 76,
      mentions: 4,
      metadata: {
        source: 'public-scrape',
        sourceClassification: {
          confidence: 'medium',
          intendedUse: 'organic_trend_discovery',
          sourceKind: 'public_platform_reference',
        },
        trendType: 'hashtag',
        urls: [
          'https://www.linkedin.com/company/openai/',
          'https://www.linkedin.com/company/stripe/',
        ],
      },
      topic: '#ai',
    });
  });

  it('does not derive topics from source URLs without observed posts', () => {
    expect(
      buildLinkedInLiveTrendTopics(
        resolveLinkedInTrendSourceUrls(undefined).map((sourceUrl) => ({
          status: 'fulfilled' as const,
          value: { sourceUrl, recentPosts: [] },
        })),
      ),
    ).toEqual([]);
    expect(
      buildLinkedInLiveTrendTopics([
        { status: 'rejected', reason: new Error('unavailable') },
      ]),
    ).toEqual([]);
  });
});
