import {
  analyzeInstagramSignals,
  buildInstagramRemixPrompt,
  deriveInstagramSeeds,
  normalizeInstagramPost,
  rankInstagramAccounts,
  sortInstagramPosts,
} from '@api/services/instagram-inspiration/instagram-inspiration.util';
import type { ApifyInstagramPost } from '@api/services/integrations/apify/interfaces/apify.interfaces';
import type { InstagramInspirationBrandContext } from '@genfeedai/interfaces';

const brand: InstagramInspirationBrandContext = {
  audience: ['founders'],
  description: 'AI content operations',
  hashtags: ['#creatorops'],
  id: 'brand-1',
  label: 'Genfeed',
  messagingPillars: ['content systems'],
  organizationId: 'org-1',
  ownUsername: 'genfeed',
  style: 'direct',
  tone: 'confident',
  topics: ['AI creators'],
};

function post(overrides: Partial<ApifyInstagramPost> = {}): ApifyInstagramPost {
  return {
    caption: 'How to build a repeatable content system?',
    commentsCount: 10,
    id: 'post-1',
    likesCount: 100,
    ownerUsername: 'peer',
    shortCode: 'ABC123',
    timestamp: '2026-07-21T12:00:00.000Z',
    videoUrl: 'https://cdn.example.com/video.mp4',
    videoViewCount: 1000,
    ...overrides,
  };
}

describe('instagram inspiration utilities', () => {
  it('derives normalized seeds from explicit and selected-brand context', () => {
    const result = deriveInstagramSeeds(
      { hashtags: ['#SaaS'], niche: 'AI Marketing' },
      brand,
    );

    expect(result.seeds).toEqual([
      'saas',
      'aimarketing',
      'aicreators',
      'creatorops',
      'contentsystems',
    ]);
  });

  it('derives video classification from videoUrl and keeps bounded provenance', () => {
    const result = normalizeInstagramPost(post({ caption: 'x'.repeat(500) }), [
      'creatorops',
    ]);

    expect(result).toMatchObject({
      isVideo: true,
      matchedSeeds: ['creatorops'],
      permalink: 'https://www.instagram.com/reel/ABC123/',
    });
    expect(result?.captionSnippet).toHaveLength(160);
  });

  it('ranks niche coverage before engagement and excludes the brand account', () => {
    const result = rankInstagramAccounts({
      mediaType: 'reels',
      now: new Date('2026-07-22T00:00:00.000Z'),
      ownUsername: 'genfeed',
      postsBySeed: [
        {
          posts: [post(), post({ id: 'own', ownerUsername: 'genfeed' })],
          seed: 'creatorops',
        },
        {
          posts: [
            post({ id: 'post-2', shortCode: 'DEF456' }),
            post({
              id: 'post-3',
              likesCount: 10_000,
              ownerUsername: 'broad-peer',
              shortCode: 'GHI789',
              timestamp: '2025-01-01T00:00:00.000Z',
            }),
          ],
          seed: 'aicreators',
        },
      ],
      seeds: ['creatorops', 'aicreators'],
      sort: 'top',
    });

    expect(result.map((account) => account.username)).toEqual([
      'peer',
      'broad-peer',
    ]);
    expect(result.some((account) => account.username === 'genfeed')).toBe(
      false,
    );
  });

  it('sorts latest and top content deterministically', () => {
    const normalized = [
      normalizeInstagramPost(post()),
      normalizeInstagramPost(
        post({
          id: 'post-2',
          likesCount: 500,
          shortCode: 'DEF456',
          timestamp: '2026-07-20T12:00:00.000Z',
        }),
      ),
    ].filter((item) => item !== null);

    expect(sortInstagramPosts(normalized, 'latest')[0]?.shortcode).toBe(
      'ABC123',
    );
    expect(sortInstagramPosts(normalized, 'top')[0]?.shortcode).toBe('DEF456');
  });

  it('abstracts source patterns without copying the source caption into the prompt', () => {
    const normalized = normalizeInstagramPost(post());
    expect(normalized).not.toBeNull();
    const signals = analyzeInstagramSignals(normalized ? [normalized] : []);
    const prompt = buildInstagramRemixPrompt({
      brand,
      mode: 'remix_concept',
      signals,
    });

    expect(signals.hooks).toContain('Question-led opening');
    expect(signals.styles).toContain('Educational demonstration');
    expect(prompt).not.toContain('How to build a repeatable content system?');
    expect(prompt).toContain('Do not copy the source caption');
  });
});
