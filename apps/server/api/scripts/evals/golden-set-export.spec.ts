import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ContentFormat,
  PostCategory,
  PostFormat,
  ReviewDecision,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { parseFixture } from '../../../../../scripts/content-eval/fixtures';
import { SYNTHETIC_ANONYMISER_KEY } from './golden-set.constants';
import type { GoldenSetScopeSnapshot } from './golden-set.types';
import { buildGoldenSet, writeGoldenSetFiles } from './golden-set-export';

function snapshot(): GoldenSetScopeSnapshot {
  const scoped = {
    isDeleted: false,
    organizationId: 'synthetic-org',
    createdAt: new Date('2026-01-01'),
  };
  return {
    scope: { organizationId: 'synthetic-org', brandIds: [] },
    organization: {
      id: 'synthetic-org',
      label: 'Invented Org',
      slug: 'invented-org',
    },
    brands: [
      {
        id: 'synthetic-brand',
        label: 'Quillmoor Paper Co.',
        slug: 'quillmoor',
      },
    ],
    credentials: [
      {
        brandId: 'synthetic-brand',
        externalHandle: '@quillmoor_studio',
        externalName: null,
        username: null,
      },
    ],
    members: [
      {
        user: {
          firstName: 'Mara',
          lastName: 'Lindqvist',
          name: 'Mara Lindqvist',
          handle: 'mara_lindqvist',
        },
      },
    ],
    posts: [1, 2].map((index) => ({
      ...scoped,
      id: `synthetic-post-${index}`,
      brandId: 'synthetic-brand',
      parentId: null,
      order: 0,
      format: PostFormat.STANDARD,
      category: PostCategory.TEXT,
      description: `Quillmoor Paper Co. notebook ${index} by Mara Lindqvist at @quillmoor_studio for Invented Org.`,
      promptUsed: 'Write for Quillmoor Paper Co.',
      platform: 'instagram',
      reviewDecision: ReviewDecision.APPROVED,
      reviewEvents: [],
    })),
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
function build(snapshots = [snapshot()], key = SYNTHETIC_ANONYMISER_KEY) {
  return buildGoldenSet({
    snapshots,
    key,
    visibility: 'synthetic',
    window: null,
  });
}

describe('golden set pipeline', () => {
  it('is byte-identical on repeated runs and after shuffling every snapshot array', () => {
    const source = snapshot();
    const firstPost = source.posts[0];
    if (!firstPost) throw new Error('Missing test post');
    const scoped = {
      organizationId: source.scope.organizationId,
      isDeleted: false,
      createdAt: firstPost.createdAt,
    };
    source.brands.push({
      id: 'second-brand',
      label: 'Tarnfield Outdoor',
      slug: 'tarnfield',
    });
    source.credentials.push({
      brandId: 'second-brand',
      externalHandle: '@tarnfield_studio',
      externalName: null,
      username: null,
    });
    source.members.push({
      user: {
        firstName: 'Tobias',
        lastName: 'Venn',
        name: 'Tobias Venn',
        handle: 'tobias_venn',
      },
    });
    source.posts[0] = { ...firstPost, format: PostFormat.THREAD };
    for (const index of [1, 2]) {
      const suffix = String(index);
      source.threadChildren.push({
        ...firstPost,
        id: `child-${suffix}`,
        parentId: firstPost.id,
        order: index,
        description: `Invented segment ${suffix}`,
      });
      source.linkedPosts.push({ ...firstPost, id: `linked-${suffix}` });
      source.linkedArticles.push({
        ...scoped,
        id: `article-${suffix}`,
        brandId: 'synthetic-brand',
        content: `Invented article ${suffix}`,
        summary: null,
      });
      source.evaluations.push({
        ...scoped,
        id: `evaluation-${suffix}`,
        contentType: 'article',
        contentId: `article-${suffix}`,
        data: {
          review: {
            reviewerId: 'invented-reviewer',
            decision: ReviewDecision.APPROVED,
            reviewerScore: 88,
          },
        },
      });
      const batchItem = {
        ...scoped,
        id: `batch-${suffix}`,
        brandId: 'synthetic-brand',
        reviewDecision: ReviewDecision.APPROVED,
        data: {
          format: ContentFormat.VIDEO,
          caption: `Invented script ${suffix}`,
        },
      };
      source.batchItems.push(batchItem);
      source.linkedBatchItems.push({
        ...batchItem,
        id: `linked-batch-${suffix}`,
      });
      const newsletter = {
        ...scoped,
        id: `newsletter-${suffix}`,
        brandId: 'synthetic-brand',
        content: `Invented letter ${suffix}`,
        summary: null,
        generationPrompt: null,
        approvedAt: firstPost.createdAt,
        approvedByUserId: 'invented-reviewer',
      };
      source.newsletters.push(newsletter);
      source.linkedNewsletters.push({
        ...newsletter,
        id: `linked-newsletter-${suffix}`,
      });
      source.contextBases.push({
        ...scoped,
        id: `base-${suffix}`,
        data: { brandId: 'synthetic-brand' },
      });
      source.contextEntries.push({
        ...scoped,
        id: `winner-${suffix}`,
        contextBaseId: `base-${suffix}`,
        data: { content: `Winning post: Invented winner ${suffix}` },
      });
      source.profiles.push({
        ...scoped,
        id: `profile-${suffix}`,
        data: {
          brandId: 'synthetic-brand',
          examples: { good: [`Invented seed ${suffix}`] },
        },
      });
    }
    const shuffled = {
      ...source,
      brands: [...source.brands].reverse(),
      credentials: [...source.credentials].reverse(),
      members: [...source.members].reverse(),
      posts: [...source.posts].reverse(),
      batchItems: [...source.batchItems].reverse(),
      evaluations: [...source.evaluations].reverse(),
      newsletters: [...source.newsletters].reverse(),
      profiles: [...source.profiles].reverse(),
      contextBases: [...source.contextBases].reverse(),
      contextEntries: [...source.contextEntries].reverse(),
      linkedPosts: [...source.linkedPosts].reverse(),
      linkedArticles: [...source.linkedArticles].reverse(),
      linkedNewsletters: [...source.linkedNewsletters].reverse(),
      linkedBatchItems: [...source.linkedBatchItems].reverse(),
      threadChildren: [...source.threadChildren].reverse(),
    };
    expect(build()).toEqual(build());
    expect(build([source])).toEqual(build([shuffled]));
  });
  it('round trips every body, redacts raw identifiers, and omits zero-row kinds', () => {
    const result = build();
    expect(result.files).toHaveLength(1);
    expect(result.report.kinds.map((kind) => kind.rows)).toEqual([
      2, 0, 0, 0, 0, 0,
    ]);
    for (const file of result.files) {
      expect(parseFixture(file.body, file.fileName)).toHaveLength(2);
      for (const raw of [
        'synthetic-org',
        'synthetic-brand',
        'synthetic-post-',
        'Quillmoor Paper Co.',
        'Mara',
        'Lindqvist',
        'quillmoor_studio',
        'Invented Org',
      ])
        expect(file.body).not.toContain(raw);
    }
  });
  it('changes only row ids and brand fixture tokens with a different key', () => {
    const first = build();
    const second = build([snapshot()], 'another-invented-public-synthetic-key');
    const normalize = (body: string) =>
      body
        .replace(/gs1-social-post-[0-9a-f]{16}/g, 'ROW')
        .replace(/brand-[0-9a-f]{12}/g, 'BRAND');
    expect(first.files[0]?.body).not.toBe(second.files[0]?.body);
    expect(first.files.map((file) => normalize(file.body))).toEqual(
      second.files.map((file) => normalize(file.body)),
    );
    expect(first.report).toEqual(second.report);
  });
  it('normalizes CRLF and uses a fallback prompt after anonymisation', () => {
    const source = snapshot();
    const first = source.posts[0];
    if (!first) throw new Error('Missing test post');
    first.description = '  First\r\nSecond  ';
    first.promptUsed = ' ';
    const rows = build([source]).files.flatMap((file) =>
      parseFixture(file.body, file.fileName),
    );
    expect(
      rows.find((row) => row.input.output === 'First\nSecond')?.input.prompt,
    ).toMatch(/^Write a social post for brand-[0-9a-f]{12}'s audience\.$/);
  });
  it('rejects duplicate output ids and excludes empty text', () => {
    expect(() => build([snapshot(), snapshot()])).toThrow('Duplicate');
    const source = snapshot();
    source.posts = source.posts.map((post) => ({ ...post, description: ' ' }));
    expect(build([source]).report.excluded.emptyText).toBe(2);
    expect(build([source]).files).toEqual([]);
  });
  it('writes files and the report without deleting existing files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'golden-export-'));
    try {
      writeFileSync(join(directory, 'preserved.txt'), 'Preserved');
      const result = build();
      writeGoldenSetFiles(directory, result);
      for (const file of result.files)
        expect(readFileSync(join(directory, file.fileName), 'utf8')).toBe(
          file.body,
        );
      expect(
        readFileSync(join(directory, 'label-quality.synthetic.json'), 'utf8'),
      ).toBe(`${JSON.stringify(result.report, null, 2)}\n`);
      expect(readFileSync(join(directory, 'preserved.txt'), 'utf8')).toBe(
        'Preserved',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
