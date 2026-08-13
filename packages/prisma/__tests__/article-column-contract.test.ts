import { describe, expect, it } from 'vitest';
import {
  ARTICLE_COLUMN_CONTRACT_MIGRATION,
  assertArticleColumnContract,
  getMissingArticleColumns,
  getRetiredArticleClientFields,
  REQUIRED_ARTICLE_COLUMNS,
  RETIRED_ARTICLE_COLUMNS,
  resolveArticleClientFields,
} from '../src/article-column-contract';
import { getModelMeta } from '../src/enum-field-map';

const migratedColumns = [
  'id',
  'userId',
  'organizationId',
  'brandId',
  'label',
  'slug',
  'content',
  'summary',
  'coverImageUrl',
  'status',
  'publishedAt',
  'isDeleted',
  'createdAt',
  'updatedAt',
  'category',
  'scope',
  'seoScore',
  'seoBreakdown',
];

describe('article column contract (Sentry 71/72)', () => {
  it('names the physical columns the public article paths write and read', () => {
    expect(REQUIRED_ARTICLE_COLUMNS).toEqual([
      'coverImageUrl',
      'label',
      'summary',
    ]);
    expect(RETIRED_ARTICLE_COLUMNS).toEqual(['excerpt', 'title']);
    expect(ARTICLE_COLUMN_CONTRACT_MIGRATION).toBe(
      '20260811160000_rename_article_title_excerpt_to_label_summary',
    );
  });

  it('reports missing live columns in stable order', () => {
    expect(getMissingArticleColumns(['label', 'summary'])).toEqual([
      'coverImageUrl',
    ]);
    expect(getMissingArticleColumns(migratedColumns)).toEqual([]);
  });

  it('detects a Prisma client that still selects the retired title column', () => {
    expect(
      getRetiredArticleClientFields(['id', 'title', 'excerpt', 'content']),
    ).toEqual(['excerpt', 'title']);
    expect(getRetiredArticleClientFields(migratedColumns)).toEqual([]);
  });

  it('fails closed on the production Sentry shape: DB migrated, client still selects title', () => {
    expect(() =>
      assertArticleColumnContract({
        clientFields: ['id', 'title', 'excerpt', 'content', 'slug'],
        presentColumns: migratedColumns,
      }),
    ).toThrow(/articles\.title does not exist/);
  });

  it('fails closed when the live table has not been renamed yet', () => {
    expect(() =>
      assertArticleColumnContract({
        clientFields: migratedColumns,
        presentColumns: ['id', 'title', 'excerpt', 'content', 'coverImageUrl'],
      }),
    ).toThrow(/missing required column\(s\): label, summary/);
  });

  it('uses committed Article metadata only when the caller omits client fields', () => {
    const resolved = resolveArticleClientFields();
    expect(resolved).toContain('label');
    expect(resolved).not.toContain('title');
    expect(resolveArticleClientFields([])).toEqual([]);
  });

  it('fails closed when committed Article metadata is empty', () => {
    expect(() =>
      assertArticleColumnContract({
        clientFields: [],
        presentColumns: migratedColumns,
      }),
    ).toThrow(/Article model metadata is missing/);
  });

  it('awaits the live finder before asserting', async () => {
    const { assertLiveArticleColumnContract } = await import(
      '../src/article-column-contract'
    );

    await expect(
      assertLiveArticleColumnContract({
        clientFields: ['id', 'title'],
        findPresentColumns: async () => migratedColumns,
      }),
    ).rejects.toThrow(/articles\.title does not exist/);
  });

  it('accepts a migrated live table against the committed Article metadata', () => {
    const clientFields = getModelMeta('Article')?.allFields ?? [];

    expect(() =>
      assertArticleColumnContract({
        clientFields,
        presentColumns: migratedColumns,
      }),
    ).not.toThrow();
    expect(clientFields).toContain('label');
    expect(clientFields).toContain('summary');
    expect(clientFields).not.toContain('title');
    expect(clientFields).not.toContain('excerpt');
  });
});
