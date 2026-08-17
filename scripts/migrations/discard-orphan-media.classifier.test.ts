import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyDiscardAction,
  classifyS3Key,
  collectSurvivingObjectKeys,
  DEFAULT_CREATED_BEFORE,
  formatSummaryTable,
  hasAssetDownstreamReference,
  isBlankMediaField,
  isMongoEraObjectKey,
  isOrphanAsset,
  isOrphanIngredient,
  isWithinCreatedBefore,
  normalizeObjectKey,
  parseDiscardOrphanMediaArgs,
  toSummaryRow,
} from './discard-orphan-media.classifier';

const ISSUE_SNAPSHOT = new Date('2026-06-01T00:00:00.000Z');
const AFTER_SNAPSHOT = new Date('2026-08-01T00:00:00.000Z');

describe('isBlankMediaField', () => {
  it('treats null, undefined, and whitespace as blank', () => {
    expect(isBlankMediaField(null)).toBe(true);
    expect(isBlankMediaField(undefined)).toBe(true);
    expect(isBlankMediaField('')).toBe(true);
    expect(isBlankMediaField('   ')).toBe(true);
  });

  it('keeps a stored key', () => {
    expect(isBlankMediaField('ingredients/images/abc')).toBe(false);
  });
});

describe('orphan vs keep classifier', () => {
  it('marks an ingredient orphan when every stored media field is empty', () => {
    expect(
      isOrphanIngredient({
        cdnUrl: null,
        s3Key: null,
        sampleAudioUrl: null,
      }),
    ).toBe(true);
    expect(
      isOrphanIngredient({
        cdnUrl: '  ',
        s3Key: undefined,
        sampleAudioUrl: '',
      }),
    ).toBe(true);
  });

  it('keeps an ingredient when any stored media field is populated', () => {
    expect(
      isOrphanIngredient({
        cdnUrl: 'https://cdn.genfeed.ai/ingredients/images/ing_1',
        s3Key: null,
        sampleAudioUrl: null,
      }),
    ).toBe(false);
    expect(
      isOrphanIngredient({
        cdnUrl: null,
        s3Key: 'ingredients/videos/ing_2',
        sampleAudioUrl: null,
      }),
    ).toBe(false);
    expect(
      isOrphanIngredient({
        cdnUrl: null,
        s3Key: null,
        sampleAudioUrl: 'https://cdn.example.com/rachel.mp3',
      }),
    ).toBe(false);
  });

  it('marks an asset orphan only when cloudObjectKey is empty', () => {
    expect(isOrphanAsset({ cloudObjectKey: null })).toBe(true);
    expect(isOrphanAsset({ cloudObjectKey: '  ' })).toBe(true);
    expect(
      isOrphanAsset({ cloudObjectKey: 'ingredients/desktop-assets/logo.png' }),
    ).toBe(false);
  });
});

describe('classifyDiscardAction', () => {
  it('skips live media even when referenced', () => {
    expect(
      classifyDiscardAction({
        createdAt: ISSUE_SNAPSHOT,
        createdBefore: DEFAULT_CREATED_BEFORE,
        hasDownstreamReference: true,
        isOrphan: false,
      }),
    ).toBe('skip');
  });

  it('soft-deletes an orphan that a downstream row still references', () => {
    expect(
      classifyDiscardAction({
        createdAt: ISSUE_SNAPSHOT,
        createdBefore: DEFAULT_CREATED_BEFORE,
        hasDownstreamReference: true,
        isOrphan: true,
      }),
    ).toBe('soft-delete');
  });

  it('hard-deletes an unreferenced orphan inside the snapshot window', () => {
    expect(
      classifyDiscardAction({
        createdAt: ISSUE_SNAPSHOT,
        createdBefore: DEFAULT_CREATED_BEFORE,
        hasDownstreamReference: false,
        isOrphan: true,
      }),
    ).toBe('hard-delete');
  });

  it('skips post-snapshot empty-key rows so derived-only new media is kept', () => {
    expect(
      classifyDiscardAction({
        createdAt: AFTER_SNAPSHOT,
        createdBefore: DEFAULT_CREATED_BEFORE,
        hasDownstreamReference: false,
        isOrphan: true,
      }),
    ).toBe('skip');
  });

  it('classifies unbounded empty-key rows when createdBefore is null', () => {
    expect(
      classifyDiscardAction({
        createdAt: AFTER_SNAPSHOT,
        createdBefore: null,
        hasDownstreamReference: false,
        isOrphan: true,
      }),
    ).toBe('hard-delete');
  });
});

describe('asset downstream references', () => {
  it('treats a parented asset as referenced', () => {
    expect(
      hasAssetDownstreamReference({
        parentBrandId: 'brand_1',
      }),
    ).toBe(true);
    expect(
      hasAssetDownstreamReference({
        parentIngredientId: 'ing_1',
      }),
    ).toBe(true);
    expect(
      hasAssetDownstreamReference({
        parentArticleId: 'art_1',
      }),
    ).toBe(true);
  });

  it('treats an unparented asset as unreferenced', () => {
    expect(
      hasAssetDownstreamReference({
        cloudObjectKey: null,
        parentArticleId: null,
        parentBrandId: null,
        parentIngredientId: null,
      }),
    ).toBe(false);
  });
});

describe('S3 68xx classifier', () => {
  const orphanKey = 'ingredients/images/68aaaaaaaaaaaaaaaaaaaaaa';
  const survivingKey = 'ingredients/desktop-assets/68bbbbbbbbbbbbbbbbbbbbbb';

  it('detects Mongo-era 68xx object ids', () => {
    expect(isMongoEraObjectKey(orphanKey)).toBe(true);
    expect(isMongoEraObjectKey('ingredients/images/cabc123')).toBe(false);
    expect(
      isMongoEraObjectKey('ingredients/images/69cccccccccccccccccccccc'),
    ).toBe(false);
  });

  it('would-delete an orphan 68xx key that no surviving row stores', () => {
    expect(
      classifyS3Key({
        key: orphanKey,
        survivingKeys: new Set([survivingKey]),
      }),
    ).toBe('hard-delete');
  });

  it('skips a 68xx key still stored on a surviving row', () => {
    expect(
      classifyS3Key({
        key: survivingKey,
        survivingKeys: new Set([survivingKey]),
      }),
    ).toBe('skip');
  });

  it('skips non-68xx keys even when they look unused', () => {
    expect(
      classifyS3Key({
        key: 'ingredients/images/cmnewgeneratedid',
        survivingKeys: new Set(),
      }),
    ).toBe('skip');
  });

  it('collects keys from stored s3Key and cdnUrl values', () => {
    const keys = collectSurvivingObjectKeys([
      'ingredients/images/keep-1',
      'https://cdn.genfeed.ai/ingredients/videos/keep-2',
      null,
      '  ',
    ]);
    expect(keys.has('ingredients/images/keep-1')).toBe(true);
    expect(keys.has('ingredients/videos/keep-2')).toBe(true);
    expect(keys.size).toBe(2);
  });

  it('normalizes a leading slash on stored keys', () => {
    expect(normalizeObjectKey('/ingredients/images/keep')).toBe(
      'ingredients/images/keep',
    );
  });
});

describe('created-before bound', () => {
  it('includes rows strictly before the cutoff', () => {
    expect(
      isWithinCreatedBefore({
        createdAt: ISSUE_SNAPSHOT,
        createdBefore: DEFAULT_CREATED_BEFORE,
      }),
    ).toBe(true);
    expect(
      isWithinCreatedBefore({
        createdAt: DEFAULT_CREATED_BEFORE,
        createdBefore: DEFAULT_CREATED_BEFORE,
      }),
    ).toBe(false);
  });
});

describe('parseDiscardOrphanMediaArgs', () => {
  it('defaults to dry-run, local env, and the issue snapshot cutoff', () => {
    const args = parseDiscardOrphanMediaArgs([]);
    expect(args.apply).toBe(false);
    expect(args.deleteS3).toBe(false);
    expect(args.envSuffix).toBe('local');
    expect(args.organizationId).toBeNull();
    expect(args.createdBefore?.toISOString()).toBe(
      DEFAULT_CREATED_BEFORE.toISOString(),
    );
  });

  it('parses apply, delete-s3, env, org, and created-before', () => {
    const args = parseDiscardOrphanMediaArgs([
      '--apply',
      '--delete-s3',
      '--env=production',
      '--organization-id=org_1',
      '--created-before=2026-07-01T00:00:00.000Z',
    ]);
    expect(args.apply).toBe(true);
    expect(args.deleteS3).toBe(true);
    expect(args.envSuffix).toBe('production');
    expect(args.organizationId).toBe('org_1');
    expect(args.createdBefore?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('clears the cutoff with --unbounded unless created-before is set', () => {
    expect(
      parseDiscardOrphanMediaArgs(['--unbounded']).createdBefore,
    ).toBeNull();
    expect(
      parseDiscardOrphanMediaArgs([
        '--unbounded',
        '--created-before=2026-01-01T00:00:00.000Z',
      ]).createdBefore?.toISOString(),
    ).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects a non-ISO created-before value', () => {
    expect(() =>
      parseDiscardOrphanMediaArgs(['--created-before=next-tuesday']),
    ).toThrow(/Invalid --created-before/);
  });
});

describe('cancelled migration scripts', () => {
  it('does not retain the cancelled s3/media backfill runners', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    expect(existsSync(resolve(dir, 's3-rename.ts'))).toBe(false);
    expect(existsSync(resolve(dir, 'backfill-asset-keys.ts'))).toBe(false);
    expect(existsSync(resolve(dir, 'backfill-media-from-s3.mjs'))).toBe(false);
  });
});

describe('summary table', () => {
  it('prints would-delete / would-soft-delete / would-skip columns', () => {
    const table = formatSummaryTable([
      toSummaryRow('ingredient', {
        'hard-delete': 2500,
        skip: 12,
        'soft-delete': 51,
      }),
      toSummaryRow('asset', {
        'hard-delete': 30,
        skip: 0,
        'soft-delete': 11,
      }),
      toSummaryRow('s3-68xx', {
        'hard-delete': 400,
        skip: 5,
        'soft-delete': 0,
      }),
    ]);

    expect(table).toContain('kind');
    expect(table).toContain('would-delete');
    expect(table).toContain('would-soft-delete');
    expect(table).toContain('would-skip');
    expect(table).toContain('ingredient');
    expect(table).toContain('2500');
    expect(table).toContain('s3-68xx');
  });
});
