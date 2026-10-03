import {
  ContentFormat,
  PostCategory,
  PostFormat,
  ReviewDecision,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import type {
  GoldenBatchItemRecord,
  GoldenEvaluationRecord,
  GoldenPostRecord,
  GoldenSetScopeSnapshot,
} from './golden-set.types';
import {
  collectCandidates,
  extractBatchItemLabels,
  extractEvaluationLabels,
  extractHarnessLabels,
  extractNewsletterLabels,
  extractPostLabels,
  extractWinnerLabels,
  resolveBatchItemKind,
  resolvePostKind,
  scoreToBand,
} from './row-mapping';

const createdAt = new Date('2026-01-01T00:00:00Z');
const scoped = { createdAt, isDeleted: false, organizationId: 'org' };
function post(overrides: Partial<GoldenPostRecord> = {}): GoldenPostRecord {
  return {
    ...scoped,
    id: 'p',
    brandId: 'brand',
    parentId: null,
    order: 0,
    format: PostFormat.STANDARD,
    category: PostCategory.TEXT,
    description: 'Invented output',
    promptUsed: 'Invented prompt',
    platform: 'INSTAGRAM',
    reviewDecision: ReviewDecision.APPROVED,
    reviewEvents: [],
    ...overrides,
  };
}
function batch(
  overrides: Partial<GoldenBatchItemRecord> = {},
): GoldenBatchItemRecord {
  return {
    ...scoped,
    id: 'b',
    brandId: 'brand',
    reviewDecision: ReviewDecision.REJECTED,
    data: { format: ContentFormat.VIDEO, caption: 'Invented caption' },
    ...overrides,
  };
}
function evaluation(data: unknown): GoldenEvaluationRecord {
  return { ...scoped, id: 'e', contentType: 'post', contentId: 'p', data };
}
function snapshot(): GoldenSetScopeSnapshot {
  return {
    scope: { organizationId: 'org', brandIds: [] },
    organization: { id: 'org', label: 'Invented Studio', slug: 'invented' },
    brands: [{ id: 'brand', label: 'Invented Brand', slug: 'invented-brand' }],
    credentials: [],
    members: [],
    posts: [],
    batchItems: [],
    evaluations: [],
    newsletters: [],
    profiles: [],
    contextBases: [],
    contextEntries: [],
    linkedPosts: [],
    linkedArticles: [],
    linkedNewsletters: [],
    linkedBatchItems: [],
    threadChildren: [],
  };
}

describe('kind mapping', () => {
  it.each([
    [PostCategory.TEXT, 'social-post'],
    [PostCategory.POST, 'social-post'],
    [PostCategory.ARTICLE, 'article'],
    [PostCategory.IMAGE, 'image-caption'],
    [PostCategory.VIDEO, 'script'],
    [PostCategory.REEL, 'script'],
    [PostCategory.STORY, 'script'],
  ])('maps post %s to %s', (category, kind) => {
    expect(resolvePostKind(post({ category }))).toBe(kind);
  });
  it('prioritizes threads and excludes children and unknown categories', () => {
    expect(
      resolvePostKind(
        post({ format: PostFormat.THREAD, category: PostCategory.IMAGE }),
      ),
    ).toBe('thread');
    expect(resolvePostKind(post({ parentId: 'root' }))).toBeNull();
    expect(resolvePostKind(post({ category: 'unknown' }))).toBeNull();
  });
  it.each([
    [ContentFormat.IMAGE, 'image-caption'],
    [ContentFormat.CAROUSEL, 'image-caption'],
    [ContentFormat.VIDEO, 'script'],
    [ContentFormat.REEL, 'script'],
    [ContentFormat.STORY, 'script'],
    ['unknown', null],
  ])('maps batch %s', (format, kind) => {
    expect(resolveBatchItemKind(batch({ data: { format } }))).toBe(kind);
    expect(
      resolveBatchItemKind(batch({ data: { format, type: 'engagement' } })),
    ).toBeNull();
  });
});
describe('label extraction', () => {
  it.each([
    ['APPROVED', 'approve'],
    ['approved', 'approve'],
    ['REJECTED', 'reject'],
    ['rejected', 'reject'],
    ['REQUEST_CHANGES', 'reject'],
    ['request_changes', 'reject'],
    ['unset', null],
    ['unknown', null],
  ])('parses %s', (value, expected) => {
    expect(
      extractPostLabels(post({ reviewDecision: value })).map(
        (label) => label.decision,
      ),
    ).toEqual(expected === null ? [] : [expected]);
    expect(
      extractBatchItemLabels(batch({ reviewDecision: value })).map(
        (label) => label.decision,
      ),
    ).toEqual(expected === null ? [] : [expected]);
  });
  it('uses the latest event per reviewer, breaks ties by index, and ignores the column when reviewers exist', () => {
    const reviewEvents = [
      { reviewerId: 'a', decision: 'rejected', reviewedAt: 'invalid' },
      { reviewerId: 'a', decision: 'approved', reviewedAt: '2026-01-01' },
      {
        reviewerId: 'a',
        decision: 'request_changes',
        reviewedAt: '2026-01-01',
      },
      { reviewerId: 'b', decision: 'unset', reviewedAt: '2026-01-02' },
      { decision: 'approved', reviewedAt: '2026-01-03' },
    ];
    expect(extractPostLabels(post({ reviewEvents }))).toMatchObject([
      { raterKey: 'a', decision: 'reject' },
    ]);
    expect(
      extractBatchItemLabels(batch({ data: { reviewEvents } })),
    ).toMatchObject([{ raterKey: 'a', decision: 'reject' }]);
  });
  it('reads decisions, finite clamped scores, and latest other reviewer comments', () => {
    const labels = extractEvaluationLabels(
      evaluation({
        review: {
          reviewerId: 'a',
          decision: 'needs_changes',
          reviewerScore: 120,
        },
        reviewerComments: [
          { reviewerId: 'a', decision: 'approved', createdAt: '2026-01-01' },
          { reviewerId: 'b', decision: 'approved', createdAt: 'invalid' },
          { reviewerId: 'b', decision: 'rejected', createdAt: '2026-01-01' },
        ],
      }),
    );
    expect(labels).toMatchObject([
      { source: 'evaluation-decision', raterKey: 'a', decision: 'reject' },
      { source: 'evaluation-score', score: 100, decision: 'approve' },
      { source: 'evaluation-decision', raterKey: 'b', decision: 'reject' },
    ]);
    expect(
      extractEvaluationLabels(
        evaluation({
          review: { reviewerId: 'a', decision: 'neutral', reviewerScore: NaN },
        }),
      ),
    ).toEqual([]);
    expect(
      extractEvaluationLabels(
        evaluation({ review: { reviewerId: 'a', reviewerScore: -1 } }),
      ),
    ).toMatchObject([{ score: 0, decision: 'reject' }]);
    expect(
      extractEvaluationLabels(
        evaluation({ review: { reviewerId: 'a', reviewerScore: 60 } }),
      ),
    ).toMatchObject([{ decision: 'approve' }]);
  });
  it.each([
    [0, 0, 0.25],
    [24.99, 0, 0.25],
    [25, 0.25, 0.5],
    [60, 0.5, 0.75],
    [99, 0.75, 1],
    [100, 0.75, 1],
  ])('bands %s', (score, min, max) => {
    expect(scoreToBand(score)).toEqual({ min, max });
  });
  it('labels newsletter approval, seed examples, tracked avoid feedback and winners', () => {
    const newsletter = {
      ...scoped,
      id: 'n',
      brandId: 'brand',
      content: null,
      summary: 'Summary',
      generationPrompt: null,
      approvedAt: createdAt,
      approvedByUserId: 'u',
    };
    expect(extractNewsletterLabels(newsletter)).toMatchObject([
      {
        source: 'newsletter-approval',
        raterKey: 'approval',
        decision: 'approve',
      },
    ]);
    expect(
      extractNewsletterLabels({ ...newsletter, approvedAt: null }),
    ).toEqual([]);
    expect(
      extractHarnessLabels({
        ...scoped,
        id: 'h',
        data: {
          examples: { good: ['Good'], avoid: ['Tracked', 'Untracked'] },
          avoidFeedback: [{ content: 'Tracked' }],
        },
      }),
    ).toMatchObject([
      { source: 'harness-avoid', decision: 'reject' },
      { source: 'harness-seed', decision: 'approve' },
      { source: 'harness-seed', decision: 'reject' },
    ]);
    expect(
      extractWinnerLabels({
        ...scoped,
        id: 'w',
        contextBaseId: 'base',
        data: {},
      }),
    ).toMatchObject([
      { source: 'harness-winner', raterKey: 'engagement', decision: 'approve' },
    ]);
  });
});
describe('candidate collection', () => {
  it('merges evaluation and winner labels into a post and strips standalone winner prefixes', () => {
    const data = snapshot();
    data.posts = [post()];
    data.evaluations = [
      evaluation({
        review: { reviewerId: 'r', decision: 'approved', reviewerScore: 88 },
      }),
    ];
    data.contextBases = [{ ...scoped, id: 'base', data: { brandId: 'brand' } }];
    data.contextEntries = [
      {
        ...scoped,
        id: 'linked',
        contextBaseId: 'base',
        data: { metadata: { postId: 'p' } },
      },
      {
        ...scoped,
        id: 'standalone',
        contextBaseId: 'base',
        data: {
          content: 'Winning post (invented): A standalone example',
          metadata: { platform: 'LINKEDIN' },
        },
      },
    ];
    const result = collectCandidates(data);
    expect(
      result.candidates.get('post:p')?.labels.map((label) => label.source),
    ).toEqual([
      'post-review',
      'evaluation-decision',
      'evaluation-score',
      'harness-winner',
    ]);
    expect(result.candidates.get('winner:standalone')).toMatchObject({
      text: 'A standalone example',
      platform: 'linkedin',
      promptBase: null,
    });
  });
  it('orders thread children and uses article, newsletter and batch text contracts', () => {
    const data = snapshot();
    data.posts = [post({ format: PostFormat.THREAD, description: 'Root' })];
    data.threadChildren = [
      post({ id: 'z', parentId: 'p', order: 2, description: 'Last' }),
      post({ id: 'a', parentId: 'p', order: 1, description: 'First' }),
    ];
    data.batchItems = [batch()];
    data.linkedArticles = [
      {
        ...scoped,
        id: 'a',
        brandId: null,
        content: null,
        summary: 'Article summary',
      },
    ];
    data.evaluations = [
      {
        ...evaluation({
          brandId: 'brand',
          review: { reviewerId: 'r', decision: 'approved' },
        }),
        contentType: 'article',
        contentId: 'a',
      },
    ];
    data.newsletters = [
      {
        ...scoped,
        id: 'n',
        brandId: 'brand',
        content: null,
        summary: 'Newsletter summary',
        generationPrompt: 'Newsletter prompt',
        approvedAt: createdAt,
        approvedByUserId: 'u',
      },
    ];
    const { candidates } = collectCandidates(data);
    expect(candidates.get('post:p')?.text).toBe('Root\n\nFirst\n\nLast');
    expect(candidates.get('article:a')).toMatchObject({
      contentKind: 'article',
      text: 'Article summary',
      brandId: 'brand',
    });
    expect(candidates.get('newsletter:n')).toMatchObject({
      text: 'Newsletter summary',
      promptBase: 'Newsletter prompt',
    });
    expect(candidates.get('batch_item:b')).toMatchObject({
      contentKind: 'script',
      text: 'Invented caption',
      promptBase: null,
    });
  });
  it('resolves avoid sources, excludes review copies, and preserves untracked seed examples', () => {
    const data = snapshot();
    data.linkedPosts = [
      post({ id: 'reviewed' }),
      post({ id: 'unreviewed', reviewDecision: null }),
    ];
    data.batchItems = [
      batch({ data: { postId: 'reviewed', format: ContentFormat.VIDEO } }),
    ];
    data.linkedBatchItems = [
      batch({ id: 'reviewed-batch' }),
      batch({ id: 'unreviewed-batch', reviewDecision: null }),
    ];
    data.linkedNewsletters = [
      {
        ...scoped,
        id: 'n',
        brandId: 'brand',
        content: 'Newsletter',
        summary: null,
        generationPrompt: null,
        approvedAt: null,
        approvedByUserId: null,
      },
    ];
    data.profiles = [
      {
        ...scoped,
        id: 'h',
        data: {
          brandId: 'brand',
          avoidFeedback: [
            'post:reviewed',
            'post:unreviewed',
            'batch_item:reviewed-batch',
            'batch_item:unreviewed-batch',
            'newsletter:n',
            'unknown',
          ].map((source) => ({
            source,
            content: 'Tracked',
            addedAt: '2026-01-01',
          })),
          examples: { good: ['Good'], avoid: ['Tracked', 'Untracked'] },
        },
      },
    ];
    const result = collectCandidates(data);
    expect(result.excluded.copyOfReview).toBe(3);
    expect(result.candidates.get('post:unreviewed')?.labels).toMatchObject([
      { source: 'harness-avoid' },
    ]);
    expect(result.candidates.get('batch_item:unreviewed-batch')?.text).toBe(
      'Invented caption',
    );
    expect(result.candidates.get('newsletter:n')?.text).toBe('Newsletter');
    expect(result.candidates.get('harness-avoid:h:unknown')?.text).toBe(
      'Tracked',
    );
    expect(
      [...result.candidates.keys()].filter((key) =>
        key.startsWith('harness-seed:'),
      ),
    ).toHaveLength(2);
  });
  it('counts missing, unsupported, absent and out-of-scope brands', () => {
    const data = snapshot();
    data.scope.brandIds = ['other'];
    data.posts = [
      post(),
      post({ id: 'unknown-brand', brandId: '' }),
      post({ id: 'child', parentId: 'p' }),
    ];
    data.evaluations = [evaluation({})];
    data.contextEntries = [
      {
        ...scoped,
        id: 'missing',
        contextBaseId: 'base',
        data: { metadata: { postId: 'absent' } },
      },
    ];
    expect(collectCandidates(data).excluded).toMatchObject({
      outOfScopeBrand: 2,
      noBrand: 1,
      unsupportedKind: 1,
      missingContent: 1,
    });
    data.evaluations = [{ ...evaluation({}), contentId: 'absent' }];
    expect(collectCandidates(data).excluded.missingContent).toBe(2);
  });
});
