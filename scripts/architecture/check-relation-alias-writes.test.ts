import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckRelationAliasWrites } from './check-relation-alias-writes';

const SCHEMA = [
  'model Post {',
  '  id             String       @id',
  '  organizationId String',
  '  organization   Organization @relation(fields: [organizationId], references: [id])',
  '  isDeleted      Boolean      @default(false)',
  '}',
  '',
  'model Organization {',
  '  id    String @id',
  '  posts Post[]',
  '}',
].join('\n');

describe('check-relation-alias-writes', () => {
  let originalCwd = '';
  let testDir = '';

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'relation-alias-writes-'));
    process.chdir(testDir);
    writeFixture('packages/prisma/prisma/schema.prisma', SCHEMA);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  it('flags find filters built directly, through variables, and through spreads', () => {
    writeService([
      '  direct(id: string) {',
      '    return this.find({ organization: id });',
      '  }',
      '  variable(id: string) {',
      '    const criteria = { organization: id };',
      '    return this.findOne(criteria);',
      '  }',
      '  spread(id: string) {',
      '    const scope = { organization: id };',
      '    return this.findOne({ ...scope });',
      '  }',
    ]);

    expect(
      runCheckRelationAliasWrites().violations.map(({ alias }) => alias),
    ).toEqual(['organization', 'organization', 'organization']);
  });

  it('flags aliases hidden in Prisma data spreads', () => {
    writeService([
      '  createDirect(id: string) {',
      '    const legacyData = { organization: id };',
      '    return this.prisma.post.create({ data: { ...legacyData } });',
      '  }',
    ]);

    expect(runCheckRelationAliasWrites().violations).toEqual([
      expect.objectContaining({ alias: 'organization', model: 'Post' }),
    ]);
  });

  it('flags dot and computed _id filter assignments', () => {
    writeService([
      '  dot(id: string) {',
      '    const criteria: Record<string, unknown> = {};',
      '    criteria._id = id;',
      '    return this.findOne(criteria);',
      '  }',
      '  computed(id: string) {',
      '    const query: Record<string, unknown> = {};',
      "    query['_id'] = id;",
      '    return this.findOne(query);',
      '  }',
    ]);

    expect(
      runCheckRelationAliasWrites().violations.map(({ alias }) => alias),
    ).toEqual(['_id', '_id']);
  });

  it('flags _id in BaseService write data', () => {
    writeService([
      '  legacyCreate(id: string) {',
      '    return this.create({ _id: id });',
      '  }',
    ]);

    expect(runCheckRelationAliasWrites().violations).toEqual([
      expect.objectContaining({ alias: '_id', model: 'Post' }),
    ]);
  });

  it('allows canonical scalars, Prisma relation operations, and relation filters', () => {
    writeService([
      '  valid(id: string) {',
      '    this.find({ organizationId: id });',
      '    this.find({ organization: { is: { isDeleted: false } } });',
      '    return this.prisma.post.create({',
      '      data: { id, organization: { connect: { id } } },',
      '    });',
      '  }',
    ]);

    expect(runCheckRelationAliasWrites().violations).toEqual([]);
  });
});

function writeService(body: string[]): void {
  writeFixture(
    'apps/server/api/src/posts/posts.service.ts',
    [
      'class BaseService {}',
      'export class PostsService extends BaseService {',
      "  constructor(readonly prisma: any) { super(null, 'post'); }",
      ...body,
      '}',
    ].join('\n'),
  );
}

function writeFixture(relativePath: string, content: string): void {
  const absolute = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}
