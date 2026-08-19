import { ContentPatternSerializer } from '@serializers/server/content/content-pattern.serializer';
import { CreatorAnalysisSerializer } from '@serializers/server/content/creator-analysis.serializer';
import { GeneratedContentSerializer } from '@serializers/server/content/generated-content.serializer';
import { PatternPlaybookSerializer } from '@serializers/server/content/pattern-playbook.serializer';
import { describe, expect, it } from 'vitest';

type ResourceObject = {
  attributes: Record<string, unknown>;
  id?: string;
  type: string;
};

describe('PatternPlaybookSerializer', () => {
  it('flattens persisted JSON data and locks type plus attribute keys', () => {
    const output = PatternPlaybookSerializer.serialize({
      data: {
        description: 'Weekly hook playbook',
        insights: { topHooks: ['open with a question'] },
        isActive: true,
        lastUpdatedAt: '2026-08-19T00:00:00.000Z',
        name: 'Hooks',
        niche: 'saas',
        patternsCount: 4,
        platform: 'twitter',
      },
      id: 'playbook-1',
      sourceCreators: ['creator-1', { id: 'creator-2' }],
    }) as ResourceObject;

    expect(output.type).toBe('pattern-playbook');
    expect(output.id).toBe('playbook-1');
    expect(Object.keys(output.attributes).sort()).toEqual([
      'description',
      'insights',
      'isActive',
      'lastUpdatedAt',
      'name',
      'niche',
      'patternsCount',
      'platform',
      'sourceCreators',
    ]);
    expect(output.attributes).toMatchObject({
      description: 'Weekly hook playbook',
      isActive: true,
      name: 'Hooks',
      patternsCount: 4,
      platform: 'twitter',
      sourceCreators: ['creator-1'],
    });
  });

  it('returns null for a missing document', () => {
    expect(PatternPlaybookSerializer.serialize(null)).toBeNull();
  });

  it('unwraps a toObject() document before flattening data', () => {
    const output = PatternPlaybookSerializer.serialize({
      toObject: () => ({
        data: { name: 'Unwrapped' },
        id: 'playbook-2',
        sourceCreators: ['creator-9'],
      }),
    }) as ResourceObject;

    expect(output).toMatchObject({
      attributes: { name: 'Unwrapped', sourceCreators: ['creator-9'] },
      id: 'playbook-2',
      type: 'pattern-playbook',
    });
  });
});

describe('ContentPatternSerializer', () => {
  it('flattens persisted JSON data and locks type plus attribute keys', () => {
    const output = ContentPatternSerializer.serialize({
      data: {
        description: 'Question hook',
        extractedFormula: 'Did you know {fact}?',
        patternType: 'hook',
        placeholders: ['fact'],
        platform: 'twitter',
        rawExample: 'Did you know this?',
        relevanceWeight: 0.9,
        sourceMetrics: { engagementRate: 0.12 },
        sourcePostDate: '2026-08-01T00:00:00.000Z',
        sourcePostUrl: 'https://example.com/post',
        tags: ['hook'],
        templateCategory: 'question',
        usageCount: 3,
      },
      id: 'pattern-1',
      sourceCreatorId: 'creator-1',
    }) as ResourceObject;

    expect(output.type).toBe('content-pattern');
    expect(output.id).toBe('pattern-1');
    expect(Object.keys(output.attributes).sort()).toEqual([
      'description',
      'extractedFormula',
      'patternType',
      'placeholders',
      'platform',
      'rawExample',
      'relevanceWeight',
      'sourceCreatorId',
      'sourceMetrics',
      'sourcePostDate',
      'sourcePostUrl',
      'tags',
      'templateCategory',
      'usageCount',
    ]);
    expect(output.attributes).toMatchObject({
      description: 'Question hook',
      extractedFormula: 'Did you know {fact}?',
      patternType: 'hook',
      sourceCreatorId: 'creator-1',
    });
  });

  it('returns null for a missing document', () => {
    expect(ContentPatternSerializer.serialize(null)).toBeNull();
  });
});

describe('CreatorAnalysisSerializer', () => {
  it('maps document fields and locks type plus attribute keys', () => {
    const output = CreatorAnalysisSerializer.serialize({
      avatarUrl: 'https://example.com/avatar.png',
      bio: 'Writes about growth',
      displayName: 'Test Creator',
      errorMessage: null,
      followerCount: 1200,
      followingCount: 80,
      handle: '@testcreator',
      lastScrapedAt: '2026-08-18T00:00:00.000Z',
      metrics: { avgEngagementRate: 0.08 },
      niche: 'growth',
      patternsExtracted: 6,
      platform: 'twitter',
      postsScraped: 40,
      profileUrl: 'https://x.com/testcreator',
      scrapeConfig: { maxPosts: 100 },
      status: 'completed',
      tags: ['saas'],
      id: 'creator-1',
    }) as ResourceObject;

    expect(output.type).toBe('creator-analysis');
    expect(output.id).toBe('creator-1');
    expect(Object.keys(output.attributes).sort()).toEqual([
      'avatarUrl',
      'bio',
      'displayName',
      'errorMessage',
      'followerCount',
      'followingCount',
      'handle',
      'lastScrapedAt',
      'metrics',
      'niche',
      'patternsExtracted',
      'platform',
      'postsScraped',
      'profileUrl',
      'scrapeConfig',
      'status',
      'tags',
    ]);
    expect(output.attributes).toMatchObject({
      displayName: 'Test Creator',
      handle: '@testcreator',
      platform: 'twitter',
      status: 'completed',
    });
  });

  it('returns null for a missing document', () => {
    expect(CreatorAnalysisSerializer.serialize(null)).toBeNull();
  });
});

describe('GeneratedContentSerializer', () => {
  it('locks type plus attribute keys for one generated document', () => {
    const output = GeneratedContentSerializer.serialize(
      {
        body: 'Generated body',
        content: 'Full content',
        cta: 'Click here',
        hashtags: ['#ai'],
        hook: 'Did you know?',
        patternId: 'p1',
        patternUsed: 'storytelling',
      },
      0,
    ) as ResourceObject;

    expect(output.type).toBe('generated-content');
    expect(output.id).toBe('generated-0');
    expect(Object.keys(output.attributes).sort()).toEqual([
      'body',
      'content',
      'cta',
      'hashtags',
      'hook',
      'patternId',
      'patternUsed',
    ]);
    expect(output.attributes).toMatchObject({
      body: 'Generated body',
      content: 'Full content',
      patternId: 'p1',
      patternUsed: 'storytelling',
    });
  });

  it('returns null for a missing generated document', () => {
    expect(GeneratedContentSerializer.serialize(null)).toBeNull();
  });

  it('wraps generated results as a JSON:API collection', () => {
    const output = GeneratedContentSerializer.serializeCollection([
      {
        body: 'A',
        content: 'A content',
        cta: 'Go',
        hashtags: ['#a'],
        hook: 'Hook A',
        patternId: 'p1',
        patternUsed: 'story',
      },
      {
        body: 'B',
        content: 'B content',
        cta: 'Stay',
        hashtags: ['#b'],
        hook: 'Hook B',
        patternId: 'p2',
        patternUsed: 'list',
      },
    ]);

    expect(output.data).toHaveLength(2);
    expect(output.data[0]?.type).toBe('generated-content');
    expect(output.data[0]?.id).toBe('generated-0');
    expect(output.data[1]?.id).toBe('generated-1');
    expect(output.meta).toEqual({
      limit: 2,
      page: 1,
      totalDocs: 2,
      totalPages: 1,
    });
  });

  it('skips invalid collection entries while keeping the requested length in meta', () => {
    const output = GeneratedContentSerializer.serializeCollection([
      {
        body: 'A',
        content: 'A content',
        hashtags: ['#a'],
        patternUsed: 'story',
      },
      null,
    ]);

    expect(output.data).toHaveLength(1);
    expect(output.meta.totalDocs).toBe(2);
  });
});
