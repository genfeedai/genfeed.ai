import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeCaptureService } from '@api/collections/contexts/services/knowledge-capture.service';
import { KnowledgeLegacyBackfillService } from '@api/collections/contexts/services/knowledge-legacy-backfill.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { KnowledgeSelectionService } from '@api/collections/contexts/services/knowledge-selection.service';
import { KnowledgeSourceIngestService } from '@api/collections/contexts/services/knowledge-source-ingest.service';
import { extractSourceText } from '@api/collections/contexts/utils/extract-source-text.util';
import { formatHarnessBrief } from '@api/services/harness/harness-brief.util';
import {
  brandMemoryHitsToHarnessSources,
  collectKnowledgeReceipts,
} from '@api/services/harness/harness-context-sources.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { CONTEXT_EMBEDDING_DIMENSION } from '@genfeedai/contracts/constants';
import type {
  BrandContentMemoryRetrievalParams,
  KnowledgeSourceIngestWorkflowInput,
} from '@genfeedai/contracts/interfaces';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock(
  '@api/collections/contexts/utils/extract-source-text.util',
  async () => {
    const actual = await vi.importActual<
      typeof import('@api/collections/contexts/utils/extract-source-text.util')
    >('@api/collections/contexts/utils/extract-source-text.util');
    return { ...actual, extractSourceText: vi.fn() };
  },
);

const describePostgres = process.env.KNOWLEDGE_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const migrations = [
  '20260904230000_knowledge_source_space_contracts',
  '20260906210000_knowledge_chunks_link_versions',
].map((name) =>
  readFileSync(
    new URL(
      `../../../../../../packages/prisma/prisma/migrations/${name}/migration.sql`,
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
  CREATE TABLE context_bases (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, "organizationId" text NOT NULL REFERENCES organizations(id), "createdById" text, "sourceBrandId" text, data jsonb NOT NULL DEFAULT '{}', "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TABLE context_entries (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, "contextBaseId" text NOT NULL REFERENCES context_bases(id), "organizationId" text NOT NULL REFERENCES organizations(id), data jsonb NOT NULL DEFAULT '{}', embedding vector(${CONTEXT_EMBEDDING_DIMENSION}), "embeddingClaimedAt" timestamptz, "embeddingFailedAt" timestamptz, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TABLE data_backfills (id text PRIMARY KEY, "completedAt" timestamptz NOT NULL DEFAULT now(), report jsonb NOT NULL);
  CREATE TABLE folders (id text PRIMARY KEY, "userId" text NOT NULL, "organizationId" text NOT NULL, "brandId" text, "parentId" text, label text NOT NULL, description text, "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TYPE "BookmarkCategory" AS ENUM ('INSTAGRAM', 'TIKTOK', 'TWEET', 'URL', 'YOUTUBE');
  CREATE TYPE "BookmarkPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'TWITTER', 'WEB', 'YOUTUBE');
  CREATE TYPE "BookmarkIntent" AS ENUM ('VIDEO', 'IMAGE', 'REPLY', 'REFERENCE', 'INSPIRATION');
  CREATE TABLE bookmarks (id text PRIMARY KEY, "userId" text NOT NULL, "organizationId" text NOT NULL, "brandId" text, "folderId" text, category "BookmarkCategory" NOT NULL DEFAULT 'URL', url text NOT NULL, platform "BookmarkPlatform" NOT NULL DEFAULT 'WEB', title text, content text NOT NULL DEFAULT '', description text, author text, "authorHandle" text, "thumbnailUrl" text, "mediaUrls" text[] NOT NULL DEFAULT '{}', "platformData" jsonb NOT NULL DEFAULT '{}', intent "BookmarkIntent" NOT NULL DEFAULT 'INSPIRATION', "savedAt" timestamptz NOT NULL DEFAULT now(), "processedAt" timestamptz, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  INSERT INTO organizations(id) VALUES ('org-a'), ('org-b');
  INSERT INTO users(id) VALUES ('user-a'), ('user-b');
  INSERT INTO brands(id, "organizationId") VALUES ('brand-a', 'org-a'), ('brand-a2', 'org-a'), ('brand-b', 'org-b');
  INSERT INTO members(id, "organizationId", "userId") VALUES ('m-a', 'org-a', 'user-a'), ('m-b', 'org-b', 'user-b');
`;

/**
 * Deterministic bag-of-words embedding: overlapping vocabulary yields high
 * cosine similarity, so retrieval ranks the way a real model would without a
 * provider call. Dimension matches the production vector column.
 */
function embed(text: string): number[] {
  const vector = new Array<number>(CONTEXT_EMBEDDING_DIMENSION).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9$]+/g) ?? []) {
    let hash = 7;
    for (const char of word) {
      hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003;
    }
    vector[hash % CONTEXT_EMBEDDING_DIMENSION] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

const actorA = {
  organizationId: 'org-a',
  userId: 'user-a',
  brandId: 'brand-a',
};
const actorA2 = { ...actorA, brandId: 'brand-a2' };
const actorB = {
  organizationId: 'org-b',
  userId: 'user-b',
  brandId: 'brand-b',
};

let pool: Pool;
let prisma: PrismaClient;
let schema: string;
let records: KnowledgeRecordsService;
let contexts: ContextsService;
let ingest: KnowledgeSourceIngestService;
let capture: KnowledgeCaptureService;
let selection: KnowledgeSelectionService;
let legacyBackfill: KnowledgeLegacyBackfillService;
const ingestRuns: KnowledgeSourceIngestWorkflowInput[] = [];

/** Runs the canonical ingest graph inline: load → mark → extract → chunk → replace → finalize. */
async function runIngest(request: KnowledgeSourceIngestWorkflowInput) {
  ingestRuns.push(request);
  const loaded = await ingest.loadSource(request);
  const marked = await ingest.markSource(loaded);
  try {
    const extracted = await ingest.extractSource(marked);
    const chunked = ingest.chunkSource(extracted);
    const replaced = await ingest.replaceChunks(chunked);
    return ingest.finalizeSource(replaced);
  } catch (error) {
    return ingest.finalizeSource(
      marked,
      error instanceof Error ? error.message : String(error),
    );
  }
}

const workflowStub = {
  enqueueBackfill: vi.fn().mockResolvedValue('backfill-job'),
  enqueueIngest: vi.fn(async (request: KnowledgeSourceIngestWorkflowInput) => {
    await runIngest(request);
    return `job-${request.versionId}`;
  }),
};

async function retrieve(
  actor: typeof actorA,
  query: string,
  extra: Partial<BrandContentMemoryRetrievalParams> = {},
) {
  return contexts.retrieveBrandContentMemory({
    brandId: actor.brandId,
    limit: 8,
    minRelevance: 0.05,
    organizationId: actor.organizationId,
    query,
    ...extra,
  });
}

describePostgres('Brand Knowledge end to end (PostgreSQL + pgvector)', () => {
  beforeEach(async () => {
    ingestRuns.length = 0;
    workflowStub.enqueueIngest.mockClear();
    vi.mocked(extractSourceText).mockReset();
    schema = `knowledge_e2e_${randomUUID().replaceAll('-', '')}`;
    pool = new Pool({
      connectionString: process.env.KNOWLEDGE_TEST_DATABASE_URL,
    });
    const client = await pool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector').catch(() => {
        // The extension already exists or the role cannot create it; the
        // vector column below fails loudly if it is truly unavailable.
      });
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
    const prismaService = prisma as unknown as PrismaService;
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    records = new KnowledgeRecordsService(prismaService);
    contexts = new ContextsService(
      prismaService,
      logger as never,
      {
        generateEmbedding: vi.fn(async (_model: string, text: string) =>
          embed(text),
        ),
      } as never,
      { getDefaultModel: vi.fn().mockResolvedValue('test-embed') } as never,
    );
    ingest = new KnowledgeSourceIngestService(prismaService, contexts);
    capture = new KnowledgeCaptureService(records, workflowStub as never);
    selection = new KnowledgeSelectionService(prismaService);
    legacyBackfill = new KnowledgeLegacyBackfillService(
      prismaService,
      records,
      workflowStub as never,
      logger as never,
    );
  });

  afterEach(async () => {
    await prisma?.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });

  it('captures text, ingests it through the canonical workflow and cites it in the brief', async () => {
    const captured = await capture.capture(actorA, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      scope: KnowledgeMemoryScope.BRAND,
      text: 'Plans start at $29 per month. Enterprise pricing is quoted on request.',
      title: 'Pricing',
    });
    expect(captured.jobId).toBe(`job-${captured.version?.id}`);
    const version = await records.getCurrentVersion(actorA, captured.source.id);
    expect(version.processingState).toBe(KnowledgeProcessingState.READY);
    expect(
      await prisma.contextEntry.count({
        where: { knowledgeSourceVersionId: version.id, isDeleted: false },
      }),
    ).toBeGreaterThan(0);

    const hits = await retrieve(actorA, 'pricing plans per month');
    expect(hits[0]).toMatchObject({
      citation: {
        kind: KnowledgeSourceKind.TEXT,
        purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
        sourceId: captured.source.id,
        title: 'Pricing',
        version: 1,
        versionId: version.id,
      },
      source: 'Pricing',
    });

    const sources = brandMemoryHitsToHarnessSources(hits, {
      limit: 8,
      minRelevance: 0.05,
    });
    const receipts = collectKnowledgeReceipts(sources);
    expect(receipts).toEqual([
      expect.objectContaining({
        excerpt: expect.stringContaining('Plans start at $29'),
        sourceId: captured.source.id,
        versionId: version.id,
      }),
    ]);
    const brief = formatHarnessBrief({
      evaluationCriteria: [],
      guardrails: [],
      metadata: { contentType: 'post', objective: 'engagement' },
      packs: [],
      providerHints: [],
      sources,
      styleDirectives: [],
      systemDirectives: [],
    });
    expect(brief).toContain('BRAND FACTS');
    expect(brief).toContain('(source: Pricing · Brand Truth)');
  });

  it('never leaks Knowledge across brands or organizations and honors explicit selection', async () => {
    const truth = await capture.capture(actorA, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      scope: KnowledgeMemoryScope.BRAND,
      text: 'Plans start at $29 per month for the starter tier.',
      title: 'Pricing',
    });
    const inspiration = await capture.capture(actorA, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      scope: KnowledgeMemoryScope.BRAND,
      text: 'Competitor hook: plans that grow with your month to month needs.',
      title: 'Competitor hook',
    });
    await capture.capture(actorB, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      scope: KnowledgeMemoryScope.BRAND,
      text: 'Other tenant plans start at $99 per month.',
      title: 'Other pricing',
    });

    const query = 'plans per month';
    expect(await retrieve(actorA2, query)).toEqual([]);
    const otherTenant = await retrieve(actorB, query);
    expect(otherTenant.map((hit) => hit.citation?.title)).toEqual([
      'Other pricing',
    ]);
    const all = await retrieve(actorA, query);
    expect(new Set(all.map((hit) => hit.citation?.sourceId))).toEqual(
      new Set([truth.source.id, inspiration.source.id]),
    );

    const filters = await selection.resolve('org-a', 'brand-a', {
      sourceIds: [truth.source.id],
    });
    const selected = await retrieve(actorA, query, filters);
    expect(selected.map((hit) => hit.citation?.sourceId)).toEqual([
      truth.source.id,
    ]);
    const byPurpose = await retrieve(actorA, query, {
      knowledgePurposes: [KnowledgeSourcePurpose.INSPIRATION],
    });
    expect(byPurpose.map((hit) => hit.citation?.sourceId)).toEqual([
      inspiration.source.id,
    ]);
    const inbox = await records.ensureInbox(actorA, KnowledgeMemoryScope.BRAND);
    const bySpace = await selection.resolve('org-a', 'brand-a', {
      spaceIds: [inbox.id],
    });
    expect(new Set(bySpace?.knowledgeSourceIds)).toEqual(
      new Set([truth.source.id, inspiration.source.id]),
    );
  });

  it('excludes hidden, archived and purged material from every later retrieval', async () => {
    const captured = await capture.capture(actorA, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      scope: KnowledgeMemoryScope.BRAND,
      text: 'Plans start at $29 per month.',
      title: 'Pricing',
    });
    const query = 'plans per month';
    expect(await retrieve(actorA, query)).toHaveLength(1);

    await records.updateSource(actorA, captured.source.id, {
      isVisible: false,
    });
    expect(await retrieve(actorA, query)).toEqual([]);
    await records.updateSource(actorA, captured.source.id, { isVisible: true });
    expect(await retrieve(actorA, query)).toHaveLength(1);

    const version = await records.getCurrentVersion(actorA, captured.source.id);
    await records.purgeVersion(actorA, captured.source.id, version.id);
    expect(await retrieve(actorA, query)).toEqual([]);
    const receipt = await records.getVersion(
      actorA,
      captured.source.id,
      version.id,
    );
    expect(receipt).toMatchObject({
      payload: null,
      provenance: null,
      version: 1,
    });

    const again = await capture.capture(actorA, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      scope: KnowledgeMemoryScope.BRAND,
      text: 'Plans start at $39 per month after the update.',
      title: 'Pricing v2',
    });
    expect(await retrieve(actorA, query)).toHaveLength(1);
    await records.deleteSource(actorA, again.source.id);
    expect(await retrieve(actorA, query)).toEqual([]);
  });

  it('records a safe failure, retries without duplicates and replaces chunks on refresh', async () => {
    vi.mocked(extractSourceText).mockRejectedValueOnce(
      new Error('Failed to fetch source (503)'),
    );
    const captured = await capture.capture(actorA, {
      kind: KnowledgeSourceKind.URL,
      purpose: KnowledgeSourcePurpose.RESEARCH,
      referenceUrl: 'https://research.example/report',
      scope: KnowledgeMemoryScope.BRAND,
      title: 'Market report',
    });
    const failed = await records.getCurrentVersion(actorA, captured.source.id);
    expect(failed).toMatchObject({
      processingError: 'Failed to fetch source (503)',
      processingState: KnowledgeProcessingState.FAILED,
    });
    expect(await retrieve(actorA, 'market report')).toEqual([]);

    vi.mocked(extractSourceText).mockResolvedValueOnce({
      mimeType: 'text/html',
      text: 'Market report: the market grew 12 percent this year.',
    });
    const retried = await capture.retry(actorA, captured.source.id);
    expect(retried.version.id).toBe(failed.id);
    expect(
      ingestRuns.filter((run) => run.versionId === failed.id),
    ).toHaveLength(2);
    expect(
      (await records.getCurrentVersion(actorA, captured.source.id))
        .processingState,
    ).toBe(KnowledgeProcessingState.READY);
    const chunksAfterRetry = await prisma.contextEntry.count({
      where: { knowledgeSourceId: captured.source.id, isDeleted: false },
    });
    expect(chunksAfterRetry).toBe(1);
    expect(await retrieve(actorA, 'market grew percent')).toHaveLength(1);

    vi.mocked(extractSourceText).mockResolvedValueOnce({
      mimeType: 'text/html',
      text: 'Market report: the market grew 15 percent this year.',
    });
    const refreshed = await capture.createVersion(actorA, captured.source.id, {
      contentHash: `sha256:${'b'.repeat(64)}`,
      observedAt: new Date().toISOString(),
      payload: { referenceUrl: 'https://research.example/report' },
      provenance: { capturedBy: 'api', url: 'https://research.example/report' },
    });
    const live = await prisma.contextEntry.findMany({
      where: { knowledgeSourceId: captured.source.id, isDeleted: false },
    });
    expect(live).toHaveLength(1);
    expect(live[0]?.knowledgeSourceVersionId).toBe(refreshed.version.id);
    const hits = await retrieve(actorA, 'market grew percent');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.citation).toMatchObject({
      version: 2,
      versionId: refreshed.version.id,
    });
  });

  it('keeps legacy context sources retrievable after migration with a citation', async () => {
    const base = await prisma.contextBase.create({
      data: {
        organizationId: 'org-a',
        sourceBrandId: 'brand-a',
        data: {
          purpose: 'knowledge-base',
          sources: [
            {
              category: 'url',
              id: 'src_legacy',
              label: 'Legacy FAQ',
              referenceUrl: 'https://brand.example/faq',
              status: 'completed',
            },
          ],
        },
      },
    });
    await prisma.contextEntry.create({
      data: {
        contextBaseId: base.id,
        organizationId: 'org-a',
        data: {
          content: 'Refunds are issued within 14 days of purchase.',
          kind: 'knowledge-source-chunk',
          metadata: { chunkIndex: 0, sourceId: 'src_legacy' },
        },
      },
    });

    const report = await legacyBackfill.run('org-a');
    expect(report.contextSources).toMatchObject({
      migrated: 1,
      relinkedChunks: 1,
    });
    expect(workflowStub.enqueueIngest).not.toHaveBeenCalled();

    const hits = await retrieve(actorA, 'refunds within days of purchase');
    expect(hits[0]).toMatchObject({
      citation: expect.objectContaining({
        purpose: KnowledgeSourcePurpose.INSPIRATION,
        title: 'Legacy FAQ',
        url: 'https://brand.example/faq',
      }),
      content: 'Refunds are issued within 14 days of purchase.',
    });
  });
});
