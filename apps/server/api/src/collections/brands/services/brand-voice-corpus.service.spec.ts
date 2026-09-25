import {
  BrandVoiceCorpusService,
  classifyOwnAccountPost,
} from '@api/collections/brands/services/brand-voice-corpus.service';
import { VOICE_CORPUS_SAMPLE_CAP } from '@api/collections/brands/utils/brand-voice-corpus.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SocialSourceType, TargetExecutionState } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

interface OwnAccountRowFixture {
  authorHandle: string | null;
  id: string;
  metrics: Record<string, number>;
  platform: string;
  publishedAt: Date | null;
  raw: Record<string, unknown>;
  source: { handle: string };
  text: string | null;
}

function ownRow(
  id: string,
  text: string | null,
  overrides: Partial<OwnAccountRowFixture> = {},
): OwnAccountRowFixture {
  return {
    authorHandle: 'acme',
    id,
    metrics: { likes: 3 },
    platform: 'twitter',
    publishedAt: new Date('2026-09-10T12:00:00.000Z'),
    raw: { authorId: 'u-acme' },
    source: { handle: 'acme' },
    text,
    ...overrides,
  };
}

describe('BrandVoiceCorpusService', () => {
  const organizationId = 'org-1';
  const brandId = 'brand-1';
  let prisma: {
    post: { findMany: ReturnType<typeof vi.fn> };
    sourcePost: { findMany: ReturnType<typeof vi.fn> };
  };
  let service: BrandVoiceCorpusService;

  beforeEach(() => {
    prisma = {
      post: { findMany: vi.fn().mockResolvedValue([]) },
      sourcePost: { findMany: vi.fn().mockResolvedValue([]) },
    };
    service = new BrandVoiceCorpusService(
      prisma as unknown as PrismaService,
      { debug: vi.fn() } as unknown as LoggerService,
    );
  });

  it('reads only own-account history and published posts, scoped to the org and brand', async () => {
    await service.buildCorpus({ brandId, organizationId });

    expect(prisma.sourcePost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId,
          isDeleted: false,
          organizationId,
          source: {
            is: {
              brandId,
              isDeleted: false,
              organizationId,
              sourceType: SocialSourceType.OWN_ACCOUNT,
            },
          },
          text: { not: null },
        },
      }),
    );
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId,
          isDeleted: false,
          organizationId,
          quoteTweetId: null,
          targetExecutionState: TargetExecutionState.PUBLISHED,
        },
      }),
    );
  });

  it('never reads stored posts without a brand and uses pasted samples only', async () => {
    const corpus = await service.buildCorpus({
      organizationId,
      pastedSamples: ['my own words'],
    });

    expect(prisma.sourcePost.findMany).not.toHaveBeenCalled();
    expect(prisma.post.findMany).not.toHaveBeenCalled();
    expect(corpus.samples).toEqual([
      expect.objectContaining({ origin: 'pasted', text: 'my own words' }),
    ]);
  });

  it('keeps own writing, drops reposts and quotes, and dedupes across origins', async () => {
    prisma.sourcePost.findMany.mockResolvedValue([
      ownRow('own-1', 'we shipped the editor'),
      ownRow('own-2', '@bob nah that is backwards', {
        raw: { authorId: 'u-acme', inReplyToId: 'u-bob' },
      }),
      ownRow('own-3', 'RT @someone: their words'),
      ownRow('own-4', 'quoted take', { raw: { isQuote: true } }),
      ownRow('own-5', 'their post', { authorHandle: 'someone-else' }),
      ownRow('own-6', 'a repost', { raw: { isRepost: true } }),
    ]);
    prisma.post.findMany.mockResolvedValue([
      {
        description: '<p>We shipped the editor</p>',
        id: 'post-1',
        platform: 'twitter',
        publicationDate: null,
        publishedAt: new Date('2026-09-11T12:00:00.000Z'),
      },
      {
        description: '<p>launch recap</p><p>more soon</p>',
        id: 'post-2',
        platform: 'linkedin',
        publicationDate: new Date('2026-09-01T12:00:00.000Z'),
        publishedAt: null,
      },
    ]);

    const corpus = await service.buildCorpus({ brandId, organizationId });

    expect(
      corpus.samples.map((sample) => [sample.id, sample.kind, sample.origin]),
    ).toEqual([
      ['own-1', 'original', 'own-account'],
      ['own-2', 'reply', 'own-account'],
      ['post-2', 'original', 'published-post'],
    ]);
    expect(corpus.samples[2]?.text).toBe('launch recap\n\nmore soon');
    expect(corpus.summary).toMatchObject({
      isSufficient: false,
      originCounts: { 'own-account': 2, pasted: 0, 'published-post': 1 },
      platforms: ['linkedin', 'twitter'],
      sampleCount: 3,
    });
  });

  it('caps the corpus', async () => {
    prisma.sourcePost.findMany.mockResolvedValue(
      Array.from({ length: VOICE_CORPUS_SAMPLE_CAP + 40 }, (_, index) =>
        ownRow(`own-${index}`, `distinct post number ${index}`),
      ),
    );

    const corpus = await service.buildCorpus({ brandId, organizationId });

    expect(corpus.samples).toHaveLength(VOICE_CORPUS_SAMPLE_CAP);
    expect(corpus.summary.isSufficient).toBe(true);
  });

  describe('classifyOwnAccountPost', () => {
    it('treats a reply to the account itself as a thread original', () => {
      expect(
        classifyOwnAccountPost(
          ownRow('t', 'part two of the thread', {
            raw: { authorId: 'u-acme', inReplyToId: 'u-acme' },
          }),
        ),
      ).toBe('original');
    });

    it('rejects empty text', () => {
      expect(classifyOwnAccountPost(ownRow('e', '   '))).toBeNull();
      expect(classifyOwnAccountPost(ownRow('n', null))).toBeNull();
    });
  });
});
