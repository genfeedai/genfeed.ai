import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectRelationAliases,
  countByFile,
  diffAgainstBaseline,
  runCheckRelationAliasReads,
} from './check-relation-alias-reads';

/**
 * Two models, mirroring the shape that makes the real schema tricky:
 * `organization`/`brand`/`credential` are relations everywhere, while
 * `metadata` is a relation on Post and a plain `Json?` column on Ingredient.
 */
const SCHEMA = [
  'model Post {',
  '  id             String        @id',
  '  organizationId String',
  '  organization   Organization  @relation(fields: [organizationId], references: [id])',
  '  brandId        String?',
  '  brand          Brand?        @relation(fields: [brandId], references: [id])',
  '  credentialId   String?',
  '  credential     Credential?   @relation(fields: [credentialId], references: [id])',
  '  metadataId     String?',
  '  metadata       Metadata?     @relation(fields: [metadataId], references: [id])',
  '}',
  '',
  'model Ingredient {',
  '  id       String  @id',
  '  metadata Json?',
  '}',
].join('\n');

describe('check-relation-alias-reads', () => {
  let originalCwd = '';
  let testDir = '';

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'relation-alias-check-'));
    process.chdir(testDir);
    writeFixture('packages/prisma/prisma/schema.prisma', SCHEMA);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  describe('collectRelationAliases', () => {
    it('pairs each relation alias with its scalar foreign key', () => {
      const aliases = collectRelationAliases(SCHEMA);

      expect(aliases.get('organization')).toBe('organizationId');
      expect(aliases.get('brand')).toBe('brandId');
      expect(aliases.get('credential')).toBe('credentialId');
    });

    it('drops names that are a plain column on any other model', () => {
      // `metadata` is a relation on Post but `Json?` on Ingredient. Without a
      // type checker the guard cannot tell which model a receiver came from,
      // so the name is unusable and must not be flagged anywhere.
      expect(collectRelationAliases(SCHEMA).has('metadata')).toBe(false);
    });

    it('handles compound foreign-key lists', () => {
      const aliases = collectRelationAliases(
        [
          'model Snapshot {',
          '  sourceId       String',
          '  organizationId String',
          '  source         Source @relation(fields: [sourceId, organizationId], references: [id, organizationId])',
          '}',
        ].join('\n'),
      );

      expect(aliases.get('source')).toBe('sourceId');
    });
  });

  describe('id-coercion rule', () => {
    it('flags String(row.alias)', () => {
      writeFixture(
        'apps/server/api/src/posts/posts.service.ts',
        [
          "import type { PostDocument } from './post.schema';",
          '',
          'export function track(post: PostDocument) {',
          '  return { organizationId: String(post.organization) };',
          '}',
        ].join('\n'),
      );

      expect(runCheckRelationAliasReads().violations).toEqual([
        expect.objectContaining({
          alias: 'organization',
          receiver: 'post',
          rule: 'id-coercion',
          scalar: 'organizationId',
        }),
      ]);
    });

    it('flags row.alias.toString()', () => {
      writeFixture(
        'apps/server/api/src/posts/posts.service.ts',
        [
          "import type { PostDocument } from './post.schema';",
          '',
          'export function track(post: PostDocument) {',
          '  return post.brand.toString();',
          '}',
        ].join('\n'),
      );

      expect(runCheckRelationAliasReads().violations).toEqual([
        expect.objectContaining({ alias: 'brand', rule: 'id-coercion' }),
      ]);
    });

    it('flags a relation alias interpolated into a template literal', () => {
      writeFixture(
        'apps/server/api/src/posts/posts.service.ts',
        [
          "import type { PostDocument } from './post.schema';",
          '',
          'export function cacheKey(post: PostDocument) {',
          `  return \`posts:\${post.organization}\`;`,
          '}',
        ].join('\n'),
      );

      expect(runCheckRelationAliasReads().violations).toEqual([
        expect.objectContaining({ alias: 'organization', rule: 'id-coercion' }),
      ]);
    });
  });

  describe('filter-value rule', () => {
    it('flags relation aliases used as id-shaped filter values', () => {
      writeFixture(
        'apps/server/api/src/posts/posts.controller.ts',
        [
          'export async function refresh(service, credentials) {',
          '  const post = await service.findOne({ _id: id });',
          '  return credentials.findOne({',
          '    _id: post.credential,',
          '    brand: post.brand,',
          '    organization: post.organization,',
          '  });',
          '}',
        ].join('\n'),
      );

      const { violations } = runCheckRelationAliasReads();

      // The security-relevant half: `normalizeWhere` drops undefined values, so
      // this lookup silently loses its tenant scoping.
      expect(violations.map((entry) => entry.alias).sort()).toEqual([
        'brand',
        'credential',
        'organization',
      ]);
      expect(violations.every((entry) => entry.rule === 'filter-value')).toBe(
        true,
      );
    });

    it('ignores alias filter keys whose value did not come from a row', () => {
      // `processSearchParams` maps alias keys to scalars, and these values come
      // from auth metadata rather than an unpopulated row — legitimate, and the
      // single largest source of false positives if the rule keyed on the name.
      writeFixture(
        'apps/server/api/src/runs/runs.controller.ts',
        [
          'export async function findOne(service, publicMetadata, id) {',
          '  return service.findOne({',
          '    _id: id,',
          '    organization: publicMetadata.organization,',
          '  });',
          '}',
        ].join('\n'),
      );

      expect(runCheckRelationAliasReads().violations).toEqual([]);
    });
  });

  describe('non-violations', () => {
    it('ignores sub-property reads, which only work when the relation is populated', () => {
      writeFixture(
        'apps/server/api/src/posts/posts.service.ts',
        [
          "import type { PostDocument } from './post.schema';",
          '',
          'export function label(post: PostDocument) {',
          '  return post.brand.label;',
          '}',
        ].join('\n'),
      );

      expect(runCheckRelationAliasReads().violations).toEqual([]);
    });

    it('ignores receivers that are not row bindings', () => {
      // A job DTO that declares `organization`/`brand` as plain strings is a
      // different type with the same property names.
      writeFixture(
        'apps/server/api/src/analytics/analytics-job.service.ts',
        [
          'export function run(job: AnalyticsJob, client) {',
          '  return client.getMediaAnalytics(String(job.organization));',
          '}',
        ].join('\n'),
      );

      expect(runCheckRelationAliasReads().violations).toEqual([]);
    });

    it('honours a relation-alias-ok annotation', () => {
      writeFixture(
        'apps/server/api/src/posts/posts.service.ts',
        [
          "import type { PostDocument } from './post.schema';",
          '',
          'export function track(post: PostDocument) {',
          '  // relation-alias-ok: findOne populates organization on this path',
          '  return String(post.organization);',
          '}',
        ].join('\n'),
      );

      expect(runCheckRelationAliasReads().violations).toEqual([]);
    });

    it('skips test files', () => {
      writeFixture(
        'apps/server/api/src/posts/posts.service.spec.ts',
        [
          "import type { PostDocument } from './post.schema';",
          '',
          'const post = { organization: { id: 1 } } as unknown as PostDocument;',
          'expect(String(post.organization)).toBeDefined();',
        ].join('\n'),
      );

      expect(runCheckRelationAliasReads().violations).toEqual([]);
    });
  });

  describe('ratchet', () => {
    const violation = (file: string) => ({
      alias: 'organization',
      file,
      line: 1,
      receiver: 'post',
      rule: 'id-coercion' as const,
      scalar: 'organizationId',
    });

    it('counts violations per file', () => {
      expect(
        countByFile([violation('a.ts'), violation('a.ts'), violation('b.ts')]),
      ).toEqual({
        'a.ts': 2,
        'b.ts': 1,
      });
    });

    it('reports a file over its baseline as a regression', () => {
      expect(diffAgainstBaseline({ 'a.ts': 3 }, { 'a.ts': 2 })).toEqual({
        regressions: [{ actual: 3, baseline: 2, file: 'a.ts' }],
        stale: [],
      });
    });

    it('reports a file under its baseline as stale so the entry gets pruned', () => {
      expect(diffAgainstBaseline({}, { 'a.ts': 2 })).toEqual({
        regressions: [],
        stale: [{ actual: 0, baseline: 2, file: 'a.ts' }],
      });
    });

    it('passes a file that exactly matches its baseline', () => {
      expect(diffAgainstBaseline({ 'a.ts': 2 }, { 'a.ts': 2 })).toEqual({
        regressions: [],
        stale: [],
      });
    });
  });
});

function writeFixture(relativePath: string, content: string): void {
  const absolute = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}
