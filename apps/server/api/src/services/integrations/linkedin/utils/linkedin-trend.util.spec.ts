import {
  buildLinkedInLiveTrendTopics,
  buildLinkedInPublicReferenceTopics,
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

  it('deduplicates public-reference topics derived from the same label', () => {
    const topics = buildLinkedInPublicReferenceTopics([
      'https://www.linkedin.com/company/open-ai/',
      'https://example.com/company/open-ai/',
      'https://www.linkedin.com/company/stripe/',
    ]);

    expect(topics.map((topic) => topic.topic)).toEqual(['#openai', '#stripe']);
    expect(topics[0]).toMatchObject({
      growthRate: 20,
      mentions: 1,
      metadata: {
        source: 'public-reference',
        sourceClassification: {
          confidence: 'low',
          intendedUse: 'organic_trend_discovery',
          sourceKind: 'public_platform_reference',
        },
        urls: ['https://www.linkedin.com/company/open-ai/'],
      },
    });
  });
});
