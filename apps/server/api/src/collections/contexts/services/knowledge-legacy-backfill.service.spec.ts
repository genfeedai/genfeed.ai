import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { KnowledgeLegacyBackfillService } from '@api/collections/contexts/services/knowledge-legacy-backfill.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

const describePostgres = process.env.KNOWLEDGE_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const migrations = [
  '20260904230000_knowledge_source_space_contracts',
  '20260906210000_knowledge_chunks_link_versions',
  '20260910180000_knowledge_version_legal_hold',
].map((name) =>
  readFileSync(
    new URL(
      `../../../../../../../packages/prisma/prisma/migrations/${name}/migration.sql`,
      import.meta.url,
    ),
    'utf8',
  ),
);

const FIXTURE_SQL = `
  CREATE TABLE organizations (id text PRIMARY KEY, "isDeleted" boolean DEFAULT false);
  CREATE TABLE users (id text PRIMARY KEY);
  CREATE TABLE brands (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "isDeleted" boolean DEFAULT false, UNIQUE(id, "organizationId"));
  CREATE TABLE members (id text PRIMARY KEY, "organizationId" text NOT NULL, "userId" text NOT NULL, "roleId" text NOT NULL DEFAULT 'owner', "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TABLE folders (id text PRIMARY KEY, "userId" text NOT NULL, "organizationId" text NOT NULL, "brandId" text, "parentId" text, label text NOT NULL, description text, "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TYPE "BookmarkCategory" AS ENUM ('INSTAGRAM', 'TIKTOK', 'TWEET', 'URL', 'YOUTUBE');
  CREATE TYPE "BookmarkPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'TWITTER', 'WEB', 'YOUTUBE');
  CREATE TYPE "BookmarkIntent" AS ENUM ('VIDEO', 'IMAGE', 'REPLY', 'REFERENCE', 'INSPIRATION');
  CREATE TABLE bookmarks (id text PRIMARY KEY, "userId" text NOT NULL, "organizationId" text NOT NULL, "brandId" text, "folderId" text, category "BookmarkCategory" NOT NULL DEFAULT 'URL', url text NOT NULL, platform "BookmarkPlatform" NOT NULL DEFAULT 'WEB', title text, content text NOT NULL DEFAULT '', description text, author text, "authorHandle" text, "thumbnailUrl" text, "mediaUrls" text[] NOT NULL DEFAULT '{}', "platformData" jsonb NOT NULL DEFAULT '{}', intent "BookmarkIntent" NOT NULL DEFAULT 'INSPIRATION', "savedAt" timestamptz NOT NULL DEFAULT now(), "processedAt" timestamptz, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TABLE context_bases (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "createdById" text, "sourceBrandId" text, data jsonb NOT NULL DEFAULT '{}', "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TABLE context_entries (id text PRIMARY KEY, "contextBaseId" text NOT NULL REFERENCES context_bases(id), "organizationId" text NOT NULL REFERENCES organizations(id), data jsonb NOT NULL DEFAULT '{}', "embeddingClaimedAt" timestamptz, "embeddingFailedAt" timestamptz, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TABLE data_backfills (id text PRIMARY KEY, "completedAt" timestamptz NOT NULL DEFAULT now(), report jsonb NOT NULL);
  INSERT INTO organizations(id) VALUES ('org-a'), ('org-b');
  INSERT INTO users(id) VALUES ('owner-a'), ('member-a'), ('owner-b');
  INSERT INTO brands(id, "organizationId") VALUES ('brand-a', 'org-a'), ('brand-b', 'org-b');
  INSERT INTO members(id, "organizationId", "userId", "createdAt") VALUES ('m-a1', 'org-a', 'owner-a', '2026-01-01'), ('m-a2', 'org-a', 'member-a', '2026-02-01'), ('m-b', 'org-b', 'owner-b', '2026-01-01');
  INSERT INTO folders(id, "userId", "organizationId", "brandId", label) VALUES ('folder-swipe', 'member-a', 'org-a', 'brand-a', 'Swipe file');
  INSERT INTO context_bases(id, "organizationId", "createdById", "sourceBrandId", data) VALUES
    ('base-brand', 'org-a', NULL, 'brand-a', '{"purpose":"knowledge-base","sources":[
      {"id":"src_url","label":"Pricing page","category":"url","referenceUrl":"https://brand.example/pricing","status":"completed","lastIngestedAt":"2026-03-01T00:00:00.000Z"},
      {"id":"src_gone","label":"Removed","category":"url","referenceUrl":"https://brand.example/old","status":"completed","isDeleted":true},
      {"id":"src_nourl","label":"Broken","category":"document","status":"failed"},
      {"id":"src_video","label":"Launch video","category":"video","referenceUrl":"https://videos.example/launch","status":"draft"}
    ]}'::jsonb),
    ('base-other-org', 'org-b', 'owner-b', 'brand-b', '{"purpose":"knowledge-base","sources":[{"id":"src_b","label":"Other tenant","category":"url","referenceUrl":"https://other.example","status":"completed"}]}'::jsonb);
  INSERT INTO context_entries(id, "contextBaseId", "organizationId", data) VALUES
    ('chunk-1', 'base-brand', 'org-a', '{"content":"Plans start at $29","kind":"knowledge-source-chunk","metadata":{"sourceId":"src_url","chunkIndex":0}}'::jsonb),
    ('chunk-2', 'base-brand', 'org-a', '{"content":"Enterprise on request","kind":"knowledge-source-chunk","metadata":{"sourceId":"src_url","chunkIndex":1}}'::jsonb),
    ('chunk-unrelated', 'base-brand', 'org-a', '{"content":"Memory","metadata":{"source":"agent-memory"}}'::jsonb);
  INSERT INTO bookmarks(id, "userId", "organizationId", "brandId", "folderId", category, url, platform, title, content, intent, "savedAt") VALUES
    ('bm-brand', 'member-a', 'org-a', 'brand-a', 'folder-swipe', 'TWEET', 'https://x.com/ada/status/1', 'TWITTER', 'Great thread', 'Hook worth stealing', 'INSPIRATION', '2026-01-02'),
    ('bm-brand-2', 'member-a', 'org-a', 'brand-a', 'folder-swipe', 'TWEET', 'https://x.com/ada/status/2', 'TWITTER', NULL, '', 'REPLY', '2026-01-03'),
    ('bm-personal', 'member-a', 'org-a', NULL, NULL, 'URL', 'https://blog.example/post', 'WEB', 'Blog post', 'Some text', 'REFERENCE', '2026-01-04'),
    ('bm-broken', 'member-a', 'org-a', 'brand-a', NULL, 'URL', 'not a url', 'WEB', 'Broken', '', 'INSPIRATION', '2026-01-05'),
    ('bm-deleted', 'member-a', 'org-a', 'brand-a', NULL, 'URL', 'https://gone.example', 'WEB', 'Gone', '', 'INSPIRATION', '2026-01-06'),
    ('bm-other-org', 'owner-b', 'org-b', 'brand-b', NULL, 'URL', 'https://other.example/x', 'WEB', 'Other', '', 'INSPIRATION', '2026-01-07');
  UPDATE bookmarks SET "isDeleted" = true WHERE id = 'bm-deleted';
`;

let pool: Pool;
let prisma: PrismaClient;
let schema: string;
let service: KnowledgeLegacyBackfillService;
let records: KnowledgeRecordsService;
const enqueueIngest = vi.fn().mockResolvedValue('job');

describePostgres('KnowledgeLegacyBackfillService with PostgreSQL', () => {
  beforeEach(async () => {
    enqueueIngest.mockClear();
    schema = `knowledge_legacy_${randomUUID().replaceAll('-', '')}`;
    pool = new Pool({
      connectionString: process.env.KNOWLEDGE_TEST_DATABASE_URL,
    });
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}", public`);
      await client.query(FIXTURE_SQL);
      for (const migration of migrations) {
        await client.query(migration);
      }
    } finally {
      await client.query('SET search_path TO public');
      client.release();
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: process.env.KNOWLEDGE_TEST_DATABASE_URL,
          options: `-c search_path="${schema}",public`,
        },
        { schema },
      ),
    });
    records = new KnowledgeRecordsService(prisma as unknown as PrismaService);
    service = new KnowledgeLegacyBackfillService(
      prisma as unknown as PrismaService,
      records,
      { enqueueIngest } as never,
      { log: vi.fn(), warn: vi.fn() } as never,
    );
  });

  afterEach(async () => {
    await prisma?.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });

  it('migrates every convertible legacy row exactly once and quarantines the rest', async () => {
    const report = await service.run('org-a');

    expect(report).toMatchObject({
      bookmarks: { migrated: 3, quarantined: 1, skipped: 0 },
      contextSources: {
        migrated: 2,
        quarantined: 1,
        relinkedChunks: 2,
        skipped: 1,
      },
      organizationId: 'org-a',
      spacesCreated: 1,
    });
    expect(report.quarantine).toEqual([
      {
        id: 'src_nourl',
        kind: 'context-source',
        reason: 'Legacy source has no reference URL',
      },
      {
        id: 'bm-broken',
        kind: 'bookmark',
        reason: 'Bookmark URL is not http(s)',
      },
    ]);

    // Legacy context source with existing chunks: relinked and ready.
    const pricing = await prisma.knowledgeSource.findFirstOrThrow({
      include: { versions: true },
      where: { organizationId: 'org-a', title: 'Pricing page' },
    });
    expect(pricing).toMatchObject({
      brandId: 'brand-a',
      kind: KnowledgeSourceKind.URL,
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      scope: KnowledgeMemoryScope.BRAND,
      userId: 'owner-a',
    });
    const pricingVersion = pricing.versions[0];
    expect(pricingVersion).toMatchObject({
      processingState: KnowledgeProcessingState.READY,
      provenance: expect.objectContaining({
        capturedBy: 'legacy-context-source',
        contextBaseId: 'base-brand',
        legacySourceId: 'src_url',
      }),
    });
    expect(
      await prisma.contextEntry.count({
        where: {
          knowledgeSourceId: pricing.id,
          knowledgeSourceVersionId: pricingVersion?.id,
        },
      }),
    ).toBe(2);
    expect(
      await prisma.contextEntry.findUniqueOrThrow({
        where: { id: 'chunk-unrelated' },
      }),
    ).toMatchObject({ knowledgeSourceId: null });

    // Unsupported legacy kind fails safely with a reason instead of queueing.
    const video = await prisma.knowledgeSource.findFirstOrThrow({
      include: { versions: true },
      where: { organizationId: 'org-a', title: 'Launch video' },
    });
    expect(video.versions[0]).toMatchObject({
      processingError: 'VIDEO sources are not ingested yet',
      processingState: KnowledgeProcessingState.FAILED,
    });

    // Bookmarks: brand ones in the folder space, personal one personal.
    const thread = await prisma.knowledgeSource.findFirstOrThrow({
      include: { memberships: { include: { space: true } }, versions: true },
      where: { organizationId: 'org-a', title: 'Great thread' },
    });
    expect(thread).toMatchObject({
      brandId: 'brand-a',
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      scope: KnowledgeMemoryScope.BRAND,
      userId: 'member-a',
    });
    expect(thread.versions[0]).toMatchObject({
      payload: {
        referenceUrl: 'https://x.com/ada/status/1',
        text: 'Hook worth stealing',
      },
      processingState: KnowledgeProcessingState.QUEUED,
      provenance: expect.objectContaining({
        bookmarkId: 'bm-brand',
        capturedBy: 'legacy-bookmark',
      }),
    });
    const spaceTitles = thread.memberships.map((m) => m.space.title).sort();
    expect(spaceTitles).toEqual(['Inbox', 'Swipe file']);
    const reply = await prisma.knowledgeSource.findFirstOrThrow({
      where: { organizationId: 'org-a', title: 'x.com' },
    });
    expect(reply.purpose).toBe(KnowledgeSourcePurpose.RESEARCH);
    const personal = await prisma.knowledgeSource.findFirstOrThrow({
      where: { organizationId: 'org-a', title: 'Blog post' },
    });
    expect(personal).toMatchObject({
      brandId: null,
      scope: KnowledgeMemoryScope.PERSONAL,
      userId: 'member-a',
    });
    expect(enqueueIngest).toHaveBeenCalledTimes(3);
    expect(enqueueIngest).toHaveBeenCalledWith({
      organizationId: 'org-a',
      sourceId: thread.id,
      versionId: thread.versions[0]?.id,
    });

    // Other tenant untouched.
    expect(
      await prisma.knowledgeSource.count({
        where: { organizationId: 'org-b' },
      }),
    ).toBe(0);
    expect(
      await prisma.dataBackfill.findUnique({
        where: { id: 'knowledge-legacy:org-a' },
      }),
    ).toMatchObject({
      report: expect.objectContaining({ organizationId: 'org-a' }),
    });
  });

  it('is idempotent across repeated and partial runs', async () => {
    const first = await service.run('org-a');
    const countAfterFirst = await prisma.knowledgeSource.count({
      where: { organizationId: 'org-a' },
    });
    enqueueIngest.mockClear();

    // Simulate a partial state: one migrated bookmark lost its membership.
    await prisma.knowledgeSpaceMembership.deleteMany({
      where: { organizationId: 'org-a', space: { title: 'Swipe file' } },
    });
    const second = await service.run('org-a');

    expect(second.bookmarks).toEqual({
      migrated: 0,
      quarantined: 1,
      skipped: 3,
    });
    expect(second.contextSources).toMatchObject({ migrated: 0, skipped: 3 });
    expect(second.spacesCreated).toBe(0);
    expect(enqueueIngest).not.toHaveBeenCalled();
    expect(
      await prisma.knowledgeSource.count({
        where: { organizationId: 'org-a' },
      }),
    ).toBe(countAfterFirst);
    expect(
      await prisma.knowledgeSpace.count({
        where: { organizationId: 'org-a', title: 'Swipe file' },
      }),
    ).toBe(1);
    expect(first.completedAt < second.completedAt).toBe(true);
  });
});
