import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { ContextEmbeddingService } from '@api/collections/contexts/services/context-embedding.service';
import { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeCaptureService } from '@api/collections/contexts/services/knowledge-capture.service';
import { KnowledgeContentRetrievalService } from '@api/collections/contexts/services/knowledge-content-retrieval.service';
import { KnowledgeEmbeddingCompletionService } from '@api/collections/contexts/services/knowledge-embedding-completion.service';
import { KnowledgeReceiptVerifierService } from '@api/collections/contexts/services/knowledge-receipt-verifier.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { KnowledgeSelectionService } from '@api/collections/contexts/services/knowledge-selection.service';
import { KnowledgeSourceIngestService } from '@api/collections/contexts/services/knowledge-source-ingest.service';
import { extractSourceText } from '@api/collections/contexts/utils/extract-source-text.util';
import { InvalidKnowledgeSearchCursorError } from '@api/collections/contexts/utils/knowledge-search-cursor.util';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { formatHarnessBrief } from '@api/services/harness/harness-brief.util';
import {
  brandMemoryHitsToHarnessSources,
  collectKnowledgeReceipts,
} from '@api/services/harness/harness-context-sources.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
  MemberRole,
} from '@genfeedai/contracts';
import { CONTEXT_EMBEDDING_DIMENSION } from '@genfeedai/contracts/constants';
import type {
  BrandContentMemoryRetrievalParams,
  BrandKnowledgeSearchParams,
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
  '20260910180000_knowledge_version_legal_hold',
  '20260917180000_knowledge_refresh_and_transcripts',
  '20260918120000_knowledge_capture_request_hash',
  '20261022090000_context_embedding_queue',
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
  CREATE TABLE users (id text PRIMARY KEY, "isDeleted" boolean NOT NULL DEFAULT false);
CREATE TABLE agent_memories (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id),
 "userId" text, "brandId" text, "campaignId" text, scope text, content text, type text, kind text, "contentType" text,
 platform text, summary text, tags text[], "sourceType" text, "sourceUrl" text, "sourceContentId" text, "sourceMessageId" text,
 metadata jsonb, importance integer, confidence double precision, "performanceSnapshot" jsonb, "isDeleted" boolean NOT NULL DEFAULT false);
CREATE TABLE agent_campaigns (id text PRIMARY KEY, "organizationId" text NOT NULL, "brandId" text, "userId" text, "isDeleted" boolean NOT NULL DEFAULT false);
  CREATE TABLE brands (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "isDeleted" boolean DEFAULT false, UNIQUE(id, "organizationId"));
  CREATE TABLE roles (id text PRIMARY KEY, key text NOT NULL, "isDeleted" boolean NOT NULL DEFAULT false);
  INSERT INTO roles(id,key) VALUES ('owner','owner');
  CREATE TABLE members (id text PRIMARY KEY, "organizationId" text NOT NULL, "userId" text NOT NULL, "roleId" text NOT NULL DEFAULT 'owner' REFERENCES roles(id), "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TABLE "_member_brands" ("A" text NOT NULL REFERENCES brands(id), "B" text NOT NULL REFERENCES members(id), UNIQUE("A","B"));
  CREATE TABLE context_bases (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, "organizationId" text NOT NULL REFERENCES organizations(id), "createdById" text, "sourceBrandId" text, data jsonb NOT NULL DEFAULT '{}', "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TABLE context_entries (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, "contextBaseId" text NOT NULL REFERENCES context_bases(id), "organizationId" text NOT NULL REFERENCES organizations(id), data jsonb NOT NULL DEFAULT '{}', embedding vector(${CONTEXT_EMBEDDING_DIMENSION}), "embeddingClaimedAt" timestamptz, "embeddingFailedAt" timestamptz, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TABLE data_backfills (id text PRIMARY KEY, "completedAt" timestamptz NOT NULL DEFAULT now(), report jsonb NOT NULL);
  CREATE TABLE folders (id text PRIMARY KEY, "userId" text NOT NULL, "organizationId" text NOT NULL, "brandId" text, "parentId" text, label text NOT NULL, description text, "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  CREATE TYPE "BookmarkCategory" AS ENUM ('INSTAGRAM', 'TIKTOK', 'TWEET', 'URL', 'YOUTUBE');
  CREATE TYPE "BookmarkPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'TWITTER', 'WEB', 'YOUTUBE');
  CREATE TYPE "BookmarkIntent" AS ENUM ('VIDEO', 'IMAGE', 'REPLY', 'REFERENCE', 'INSPIRATION');
  CREATE TABLE bookmarks (id text PRIMARY KEY, "userId" text NOT NULL, "organizationId" text NOT NULL, "brandId" text, "folderId" text, category "BookmarkCategory" NOT NULL DEFAULT 'URL', url text NOT NULL, platform "BookmarkPlatform" NOT NULL DEFAULT 'WEB', title text, content text NOT NULL DEFAULT '', description text, author text, "authorHandle" text, "thumbnailUrl" text, "mediaUrls" text[] NOT NULL DEFAULT '{}', "platformData" jsonb NOT NULL DEFAULT '{}', intent "BookmarkIntent" NOT NULL DEFAULT 'INSPIRATION', "savedAt" timestamptz NOT NULL DEFAULT now(), "processedAt" timestamptz, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
  INSERT INTO organizations(id) VALUES ('org-a'), ('org-b');
  INSERT INTO users(id) VALUES ('user-a'), ('user-a-other'), ('user-b');
  INSERT INTO brands(id, "organizationId") VALUES ('brand-a', 'org-a'), ('brand-a2', 'org-a'), ('brand-b', 'org-b');
  INSERT INTO members(id, "organizationId", "userId") VALUES ('m-a', 'org-a', 'user-a'), ('m-a-other', 'org-a', 'user-a-other'), ('m-b', 'org-b', 'user-b');
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

const actorA: KnowledgeActor = {
  organizationId: 'org-a',
  userId: 'user-a',
  brandId: 'brand-a',
  role: MemberRole.ADMIN,
};
const actorA2: KnowledgeActor = { ...actorA, brandId: 'brand-a2' };
const actorB: KnowledgeActor = {
  organizationId: 'org-b',
  userId: 'user-b',
  brandId: 'brand-b',
  role: MemberRole.ADMIN,
};
/** A second member of org-a with no brand of their own — the automatic
 * no-brand chat retrieval path (org-scope + personal-scope). */
const actorAOrgOnly: KnowledgeActor = {
  organizationId: 'org-a',
  userId: 'user-a',
  role: MemberRole.ADMIN,
};
const actorAOther: KnowledgeActor = {
  organizationId: 'org-a',
  userId: 'user-a-other',
  role: MemberRole.ADMIN,
};

let pool: Pool;
let prisma: PrismaClient;
let schema: string;
let records: KnowledgeRecordsService;
let contexts: ContextsService;
let embeddingExecution: ContextEmbeddingService;
let knowledgeContentRetrieval: KnowledgeContentRetrievalService;
let ingest: KnowledgeSourceIngestService;
let capture: KnowledgeCaptureService;
let selection: KnowledgeSelectionService;
let agentContextAssembly: AgentContextAssemblyService;

/** Minimal brand identity the fixture brands table names — just enough for
 * `AgentContextAssemblyService.assembleContext` to render identity without a
 * real Brand row or BrandsService. */
function fakeBrand(id: string, organizationId: string) {
  return {
    id,
    label: `Brand ${id}`,
    organizationId,
  };
}
const ingestRuns: KnowledgeSourceIngestWorkflowInput[] = [];

/** Runs the canonical ingest graph inline: load → mark → extract → chunk → replace → finalize. */
async function runIngest(request: KnowledgeSourceIngestWorkflowInput) {
  ingestRuns.push(request);
  const loaded = await ingest.loadSource(request);
  const marked = await ingest.markSource(loaded);
  try {
    const extracted = await ingest.extractSource(marked);
    const chunked = await ingest.chunkSource(extracted);
    const replaced = await ingest.replaceChunks(chunked, randomUUID());
    const pending = await ingest.finalizeSource(replaced);
    if (pending.status !== 'queued') return pending;
    const version = await prisma.knowledgeSourceVersion.findFirstOrThrow({
      where: {
        id: request.versionId,
        sourceId: request.sourceId,
        organizationId: request.organizationId,
        isDeleted: false,
      },
    });
    expect(version.processingState).toBe(KnowledgeProcessingState.PROCESSING);
    const jobs = await prisma.contextEmbeddingJob.findMany({
      where: {
        organizationId: request.organizationId,
        generation: version.embeddingGeneration,
        isDeleted: false,
        contextEntry: {
          is: {
            organizationId: request.organizationId,
            knowledgeSourceVersionId: request.versionId,
            isDeleted: false,
          },
        },
      },
    });
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs)
      await embeddingExecution.process({
        jobId: job.id,
        organizationId: job.organizationId,
        generation: job.generation,
      });
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
  actor: KnowledgeActor,
  query: string,
  extra: Partial<BrandContentMemoryRetrievalParams> = {},
) {
  return knowledgeContentRetrieval.retrieveBrandContentMemory({
    brandId: actor.brandId ?? '',
    userId: actor.userId,
    limit: 8,
    minRelevance: 0.05,
    organizationId: actor.organizationId,
    query,
    ...extra,
  });
}

/** The automatic chat-retrieval path for a thread with no validated brand. */
async function retrieveOrgAndPersonal(actor: KnowledgeActor, query: string) {
  return knowledgeContentRetrieval.retrieveOrgAndPersonalContentMemory({
    limit: 8,
    minRelevance: 0.05,
    organizationId: actor.organizationId,
    query,
    userId: actor.userId,
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
    const policy = brandAccessFixture(prismaService);
    const provider = new ContextEmbeddingProviderService(
      { getDefaultModel: vi.fn().mockResolvedValue('test-embed') } as never,
      {
        embeddings: vi.fn(async ({ input }: { input: string | string[] }) => ({
          data: [
            {
              embedding: embed(Array.isArray(input) ? input[0] : input),
              index: 0,
            },
          ],
        })),
      } as never,
    );
    const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const writer = new ContextEmbeddingWriteService(
      prismaService,
      policy,
      provider,
      queue as never,
      logger as never,
    );
    const completion = new KnowledgeEmbeddingCompletionService(
      prismaService,
      writer,
      provider,
      queue as never,
    );
    embeddingExecution = new ContextEmbeddingService(
      prismaService,
      writer,
      provider,
    );
    records = new KnowledgeRecordsService(prismaService, policy, completion);
    contexts = new ContextsService(
      prismaService,
      logger as never,
      provider,
      writer,
    );
    knowledgeContentRetrieval = new KnowledgeContentRetrievalService(
      prismaService,
      contexts,
      policy,
    );
    ingest = new KnowledgeSourceIngestService(
      prismaService,
      policy,
      records,
      completion,
    );
    capture = new KnowledgeCaptureService(
      records,
      workflowStub as never,
      { refresh: vi.fn() } as never,
    );
    selection = new KnowledgeSelectionService(
      prismaService,
      brandAccessFixture(prismaService as never),
    );
    const noopCache = {
      generateKey: (...parts: string[]) => parts.join(':'),
      getOrSet: (_key: string, factory: () => Promise<unknown>) => factory(),
    };
    const fakeBrandsService = {
      brandAccessService: brandAccessFixture(prismaService),
      findOne: vi.fn(
        async (filter: { id?: string; organizationId: string }) => {
          if (filter.id) return fakeBrand(filter.id, filter.organizationId);
          return null;
        },
      ),
      resolveBrandKitAssets: vi.fn().mockResolvedValue({ references: [] }),
    };
    // #5219: Brand.isSelected is retired. The acting member's own
    // currentBrandId stands in for the old org-wide fallback — an unbranded
    // thread's identity layer still resolves to it, but RAG scoping must key
    // off the *caller's* explicit brandId, never this fallback.
    const fakeMembersService = {
      findOne: vi.fn().mockResolvedValue({ currentBrandId: 'brand-a' }),
    };
    agentContextAssembly = new AgentContextAssemblyService(
      fakeBrandsService as never,
      { getInsights: vi.fn().mockResolvedValue([]) } as never,
      knowledgeContentRetrieval,
      fakeMembersService as never,
      { post: { findMany: vi.fn().mockResolvedValue([]) } } as never,
      noopCache as never,
      logger as never,
      { getTopPatternsForBrand: vi.fn().mockResolvedValue([]) } as never,
      { findOne: vi.fn().mockResolvedValue(null) } as never,
      undefined as never,
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
      appliedPacks: [],
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

    const filters = await selection.resolve(
      'org-a',
      'brand-a',
      {
        sourceIds: [truth.source.id],
      },
      actorA,
    );
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
    const bySpace = await selection.resolve(
      'org-a',
      'brand-a',
      {
        spaceIds: [inbox.id],
      },
      actorA,
    );
    expect(new Set(bySpace?.knowledgeSourceIds)).toEqual(
      new Set([truth.source.id, inspiration.source.id]),
    );
  });

  it('never surfaces brand B’s saved memory in brand A’s assembled chat context (AgentContextAssemblyService)', async () => {
    // AgentContextAssemblyService's automatic retrieval uses
    // ContextsService's own default minRelevance (0.65, stricter than this
    // file's other cases), so these passages stay short with heavy word
    // overlap against the query rather than a longer, more realistic note.
    const memoryA = await capture.capture(actorA, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      scope: KnowledgeMemoryScope.BRAND,
      text: 'Brand A Q3 launch numbers.',
      title: 'Brand A Q3 note',
    });
    const memoryB = await capture.capture(actorB, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      scope: KnowledgeMemoryScope.BRAND,
      text: 'Brand B Q3 launch numbers.',
      title: 'Brand B Q3 note',
    });

    const query = 'Q3 launch numbers';
    const disabledLayers = {
      brandGuidance: false,
      brandIdentity: true,
      brandKnowledge: false,
      brandMemory: false,
      performancePatterns: false,
      ragContext: true,
      recentPosts: false,
    };

    const contextA = await agentContextAssembly.assembleContext({
      brandId: 'brand-a',
      layers: disabledLayers,
      organizationId: 'org-a',
      query,
      userId: 'user-a',
    });
    expect(
      contextA?.ragEntries?.map((entry) => entry.citation.sourceId),
    ).toEqual([memoryA.source.id]);
    expect(JSON.stringify(contextA?.ragEntries)).not.toContain(
      memoryB.source.id,
    );

    const contextB = await agentContextAssembly.assembleContext({
      brandId: 'brand-b',
      layers: disabledLayers,
      organizationId: 'org-b',
      query,
      userId: 'user-b',
    });
    expect(
      contextB?.ragEntries?.map((entry) => entry.citation.sourceId),
    ).toEqual([memoryB.source.id]);
    expect(JSON.stringify(contextB?.ragEntries)).not.toContain(
      memoryA.source.id,
    );

    // The exact #5144 bug: brand-a2 is a *sibling* brand in the SAME
    // organization as brand-a (not a different tenant), so this proves the
    // isolation is per-brand, not merely per-org. The legacy
    // getRelevantContextBases path selected every active context base in the
    // organization with no brand filter, so brand-a2's thread would have
    // seen brand-a's saved memory too.
    const contextSiblingBrand = await agentContextAssembly.assembleContext({
      brandId: 'brand-a2',
      layers: disabledLayers,
      organizationId: 'org-a',
      query,
      userId: 'user-a',
    });
    expect(contextSiblingBrand?.brandId).toBe('brand-a2');
    expect(contextSiblingBrand?.ragEntries).toBeUndefined();

    // An unbranded thread in brand A's own organization must not inherit
    // brand A's saved memory either — only org/personal scope is eligible.
    const unbrandedContext = await agentContextAssembly.assembleContext({
      layers: disabledLayers,
      organizationId: 'org-a',
      query,
      userId: 'user-a',
    });
    expect(unbrandedContext?.ragEntries).toBeUndefined();
  });

  it('scopes automatic no-brand chat retrieval to organization plus the actor’s own personal Knowledge', async () => {
    // Brand A's own Knowledge must never reach an unbranded thread just
    // because it happens to live in the same organization.
    const brandOnly = await capture.capture(actorA, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      scope: KnowledgeMemoryScope.BRAND,
      text: 'Brand A only: our launch playbook per month.',
      title: 'Brand A playbook',
    });
    const orgWide = await capture.capture(actorAOrgOnly, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      scope: KnowledgeMemoryScope.ORG,
      text: 'Org-wide note: renew the domain every month.',
      title: 'Org renewal note',
    });
    const personalMine = await capture.capture(actorAOrgOnly, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      scope: KnowledgeMemoryScope.PERSONAL,
      text: 'Personal reminder: follow up on the invoice every month.',
      title: 'My personal reminder',
    });
    const personalOther = await capture.capture(actorAOther, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      scope: KnowledgeMemoryScope.PERSONAL,
      text: 'Someone else’s personal note about the month ahead.',
      title: 'Other member note',
    });
    await capture.capture(actorB, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      scope: KnowledgeMemoryScope.ORG,
      text: 'Other tenant org note about the coming month.',
      title: 'Other tenant note',
    });

    const query = 'note about the month';
    const mine = await retrieveOrgAndPersonal(actorAOrgOnly, query);
    expect(new Set(mine.map((hit) => hit.citation?.sourceId))).toEqual(
      new Set([orgWide.source.id, personalMine.source.id]),
    );
    expect(mine.map((hit) => hit.citation?.sourceId)).not.toContain(
      brandOnly.source.id,
    );
    expect(mine.map((hit) => hit.citation?.sourceId)).not.toContain(
      personalOther.source.id,
    );

    const otherMember = await retrieveOrgAndPersonal(actorAOther, query);
    expect(new Set(otherMember.map((hit) => hit.citation?.sourceId))).toEqual(
      new Set([orgWide.source.id, personalOther.source.id]),
    );
    expect(otherMember.map((hit) => hit.citation?.sourceId)).not.toContain(
      personalMine.source.id,
    );

    const otherTenant = await retrieveOrgAndPersonal(actorB, query);
    expect(otherTenant.map((hit) => hit.citation?.sourceId)).not.toContain(
      orgWide.source.id,
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

  it('keeps a chat citation only while its exact passage stays readable to the asking user', async () => {
    const captured = await capture.capture(actorA, {
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      scope: KnowledgeMemoryScope.BRAND,
      text: 'Plans start at $29 per month.',
      title: 'Pricing',
    });
    const version = await records.getCurrentVersion(actorA, captured.source.id);
    const verifier = new KnowledgeReceiptVerifierService(
      prisma as unknown as PrismaService,
      records,
    );
    const receipt = {
      excerpt: 'Plans start at $29 per month.',
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      relevance: 0.9,
      sourceId: captured.source.id,
      title: 'stale title',
      version: version.version,
      versionId: version.id,
    };

    expect(await verifier.revalidate(actorA, receipt)).toMatchObject({
      excerpt: receipt.excerpt,
      sourceId: captured.source.id,
      title: 'Pricing',
      versionId: version.id,
    });
    // Another organization's user never gets this source back, even by id.
    expect(await verifier.revalidate(actorB, receipt)).toBeNull();

    await records.updateSource(actorA, captured.source.id, {
      isVisible: false,
    });
    expect(await verifier.revalidate(actorA, receipt)).toBeNull();
    await records.updateSource(actorA, captured.source.id, { isVisible: true });
    expect(await verifier.revalidate(actorA, receipt)).not.toBeNull();

    await records.purgeVersion(actorA, captured.source.id, version.id);
    expect(await verifier.revalidate(actorA, receipt)).toBeNull();
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

    workflowStub.enqueueIngest.mockImplementationOnce(
      async () => 'delayed-manual-ingest',
    );
    vi.mocked(extractSourceText).mockRejectedValueOnce(
      new Error('Temporary source failure'),
    );
    const refreshed = await capture.createVersion(actorA, captured.source.id, {
      contentHash: `sha256:${'b'.repeat(64)}`,
      observedAt: new Date().toISOString(),
      payload: { referenceUrl: 'https://research.example/report' },
      provenance: { capturedBy: 'api', url: 'https://research.example/report' },
    });
    expect(refreshed.version.isCurrent).toBe(false);
    expect(
      (await records.getCurrentVersion(actorA, captured.source.id)).id,
    ).toBe(failed.id);
    expect(
      (await retrieve(actorA, 'market grew percent'))[0]?.citation?.versionId,
    ).toBe(failed.id);
    await expect(
      capture.createVersion(actorA, captured.source.id, {
        contentHash: 'sha256:' + 'c'.repeat(64),
        observedAt: new Date().toISOString(),
        payload: { referenceUrl: 'https://research.example/report' },
        provenance: {
          capturedBy: 'api',
          url: 'https://research.example/report',
        },
      }),
    ).rejects.toThrow('in progress');
    const queued = workflowStub.enqueueIngest.mock.calls.at(-1)?.[0];
    if (!queued) throw new Error('Missing admitted manual ingest');
    await runIngest(queued);
    expect(
      await prisma.knowledgeSourceRefreshRun.findFirst({
        where: {
          organizationId: actorA.organizationId,
          sourceId: captured.source.id,
          candidateVersionId: refreshed.version.id,
          isDeleted: false,
        },
      }),
    ).toMatchObject({ status: 'FAILED', expectedCurrentVersionId: failed.id });
    expect(
      await prisma.knowledgeEmbeddingManifest.count({
        where: {
          organizationId: actorA.organizationId,
          sourceId: captured.source.id,
          versionId: refreshed.version.id,
          isDeleted: false,
        },
      }),
    ).toBe(0);
    expect(
      (
        await records.getVersion(
          actorA,
          captured.source.id,
          refreshed.version.id,
        )
      ).processingState,
    ).toBe(KnowledgeProcessingState.FAILED);
    expect(
      (await records.getCurrentVersion(actorA, captured.source.id)).id,
    ).toBe(failed.id);
    expect(
      (await retrieve(actorA, 'market grew percent'))[0]?.citation?.versionId,
    ).toBe(failed.id);
    vi.mocked(extractSourceText).mockResolvedValueOnce({
      mimeType: 'text/html',
      text: 'Market report: the market grew 15 percent this year.',
    });
    const retriedManual = await capture.retry(actorA, captured.source.id);
    expect(retriedManual.version.id).toBe(refreshed.version.id);
    expect(
      (await records.getCurrentVersion(actorA, captured.source.id)).id,
    ).toBe(refreshed.version.id);
    expect(
      await prisma.knowledgeSourceVersion.count({
        where: {
          organizationId: actorA.organizationId,
          sourceId: captured.source.id,
          isCurrent: true,
          isDeleted: false,
        },
      }),
    ).toBe(1);
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
  describe('Knowledge search', () => {
    const search = (
      actor: KnowledgeActor,
      query: string,
      extra: Partial<BrandKnowledgeSearchParams> = {},
    ) =>
      knowledgeContentRetrieval.searchBrandKnowledge({
        brandId: actor.brandId ?? '',
        limit: 6,
        minRelevance: 0.6,
        organizationId: actor.organizationId,
        query,
        userId: actor.userId,
        ...extra,
      });
    const note = (title: string, text: string) =>
      capture.capture(actorA, {
        kind: KnowledgeSourceKind.TEXT,
        purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
        scope: KnowledgeMemoryScope.BRAND,
        text,
        title,
      });
    const titles = (page: { hits: Array<{ source?: string }> }) =>
      page.hits.map((hit) => hit.source);

    it('returns a passage with an exact name even when its similarity is below the threshold', async () => {
      await note(
        'Grinder launch',
        'The Zephyr-9 espresso grinder ships in March with a ceramic burr set.',
      );
      await note(
        'Pricing',
        'Plans start at $29 per month for the starter tier.',
      );
      const query = 'What does the Zephyr-9 cost?';

      // Vector similarity alone misses it: only a few common words overlap.
      expect(await retrieve(actorA, query, { minRelevance: 0.6 })).toEqual([]);

      const page = await search(actorA, query);
      expect(titles(page)).toEqual(['Grinder launch']);
      expect(page.hits[0]?.relevance).toBeLessThan(0.6);
      expect(page.nextCursor).toBeUndefined();
    });

    it('ranks an exact-name passage above an equally similar one without the name', async () => {
      await note('Plain', 'Zephyr nine espresso grinder ships in March today.');
      await note('Named', 'Zephyr-9 espresso grinder ships in March today.');

      const page = await search(
        actorA,
        'Zephyr-9 espresso grinder ships March',
        {
          minRelevance: 0.3,
        },
      );

      expect(titles(page)[0]).toBe('Named');
    });

    it('filters by capture date and source kind and keeps eligibility on every filter', async () => {
      const older = await note('Older', 'Zephyr-9 grinder notes from January.');
      const newer = await note('Newer', 'Zephyr-9 grinder notes from June.');
      const olderVersion = await records.getCurrentVersion(
        actorA,
        older.source.id,
      );
      const newerVersion = await records.getCurrentVersion(
        actorA,
        newer.source.id,
      );
      // Evidence is immutable by trigger; the fixture backdates it directly.
      await prisma.$executeRawUnsafe(
        'ALTER TABLE knowledge_source_versions DISABLE TRIGGER USER',
      );
      await prisma.$executeRawUnsafe(
        `UPDATE knowledge_source_versions SET "observedAt" = '2026-01-15T00:00:00Z' WHERE id = '${olderVersion.id}'`,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE knowledge_source_versions SET "observedAt" = '2026-06-15T00:00:00Z' WHERE id = '${newerVersion.id}'`,
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE knowledge_source_versions ENABLE TRIGGER USER',
      );
      await prisma.$executeRawUnsafe(
        `UPDATE knowledge_sources SET kind = 'URL' WHERE id = '${newer.source.id}'`,
      );
      const query = 'Zephyr-9 grinder notes';

      expect(titles(await search(actorA, query)).sort()).toEqual([
        'Newer',
        'Older',
      ]);
      const recent = await search(actorA, query, {
        occurredFrom: new Date('2026-03-01T00:00:00Z'),
      });
      expect(titles(recent)).toEqual(['Newer']);
      expect(recent.hits[0]?.occurredAt).toBe('2026-06-15T00:00:00.000Z');
      expect(
        titles(
          await search(actorA, query, {
            occurredTo: new Date('2026-03-01T00:00:00Z'),
          }),
        ),
      ).toEqual(['Older']);
      // Both ends are inclusive.
      expect(
        titles(
          await search(actorA, query, {
            occurredFrom: new Date('2026-01-15T00:00:00Z'),
            occurredTo: new Date('2026-01-15T00:00:00Z'),
          }),
        ),
      ).toEqual(['Older']);
      expect(
        titles(
          await search(actorA, query, {
            kinds: [KnowledgeSourceKind.URL],
          }),
        ),
      ).toEqual(['Newer']);
      expect(
        await search(actorA, query, {
          kinds: [KnowledgeSourceKind.URL],
          occurredTo: new Date('2026-03-01T00:00:00Z'),
        }),
      ).toEqual({ hits: [] });

      // A hidden source stays hidden whatever the filter.
      await prisma.knowledgeSource.update({
        data: { isVisible: false },
        where: { id: newer.source.id },
      });
      expect(
        await search(actorA, query, { kinds: [KnowledgeSourceKind.URL] }),
      ).toEqual({ hits: [] });
    });

    it('pages deterministically and drops a source that becomes ineligible between pages', async () => {
      const sources = [];
      for (const word of ['alpha', 'bravo', 'charlie', 'delta', 'echo']) {
        sources.push(
          await note(`Note ${word}`, `Zephyr-9 grinder note about ${word}.`),
        );
      }
      const query = 'Zephyr-9 grinder note';

      const everything = await search(actorA, query, { limit: 12 });
      expect(everything.hits).toHaveLength(5);
      expect(everything.nextCursor).toBeUndefined();

      const first = await search(actorA, query, { limit: 2 });
      expect(first.hits).toHaveLength(2);
      expect(first.nextCursor).toBeDefined();
      expect(titles(first)).toEqual(titles(everything).slice(0, 2));

      const second = await search(actorA, query, {
        cursor: first.nextCursor,
        limit: 2,
      });
      expect(titles(second)).toEqual(titles(everything).slice(2, 4));
      expect(second.nextCursor).toBeDefined();

      const third = await search(actorA, query, {
        cursor: second.nextCursor,
        limit: 2,
      });
      expect(titles(third)).toEqual(titles(everything).slice(4));
      expect(third.nextCursor).toBeUndefined();

      // The source that would have led the last page is hidden after page two.
      const lastTitle = titles(everything)[4];
      const hidden = sources.find(
        (source) => source.source.title === lastTitle,
      );
      await prisma.knowledgeSource.update({
        data: { isVisible: false },
        where: { id: hidden?.source.id },
      });
      const afterHide = await search(actorA, query, {
        cursor: second.nextCursor,
        limit: 2,
      });
      expect(afterHide.hits).toEqual([]);
      expect(afterHide.nextCursor).toBeUndefined();
    });

    it('lists matching passages oldest first with citations and pages through them', async () => {
      const sources = [];
      for (const [word, observedAt] of [
        ['gamma', '2026-03-01T00:00:00Z'],
        ['alpha', '2026-01-01T00:00:00Z'],
        ['delta', '2026-04-01T00:00:00Z'],
        ['beta', '2026-02-01T00:00:00Z'],
      ] as const) {
        const added = await note(
          `Note ${word}`,
          `Zephyr-9 grinder update about ${word}.`,
        );
        sources.push({ added, observedAt });
      }
      await prisma.$executeRawUnsafe(
        'ALTER TABLE knowledge_source_versions DISABLE TRIGGER USER',
      );
      for (const { added, observedAt } of sources) {
        const version = await records.getCurrentVersion(
          actorA,
          added.source.id,
        );
        await prisma.$executeRawUnsafe(
          `UPDATE knowledge_source_versions SET "observedAt" = '${observedAt}' WHERE id = '${version.id}'`,
        );
      }
      await prisma.$executeRawUnsafe(
        'ALTER TABLE knowledge_source_versions ENABLE TRIGGER USER',
      );
      const query = 'Zephyr-9 grinder update';

      const all = await search(actorA, query, { limit: 12, mode: 'timeline' });
      expect(titles(all)).toEqual([
        'Note alpha',
        'Note beta',
        'Note gamma',
        'Note delta',
      ]);
      expect(all.hits.map((hit) => hit.occurredAt)).toEqual([
        '2026-01-01T00:00:00.000Z',
        '2026-02-01T00:00:00.000Z',
        '2026-03-01T00:00:00.000Z',
        '2026-04-01T00:00:00.000Z',
      ]);
      expect(all.hits.every((hit) => hit.citation)).toBe(true);

      const first = await search(actorA, query, { limit: 3, mode: 'timeline' });
      expect(titles(first)).toEqual(titles(all).slice(0, 3));
      const second = await search(actorA, query, {
        cursor: first.nextCursor,
        limit: 3,
        mode: 'timeline',
      });
      expect(titles(second)).toEqual(['Note delta']);
      expect(second.nextCursor).toBeUndefined();

      const window = await search(actorA, query, {
        mode: 'timeline',
        occurredFrom: new Date('2026-02-01T00:00:00Z'),
        occurredTo: new Date('2026-03-01T00:00:00Z'),
      });
      expect(titles(window)).toEqual(['Note beta', 'Note gamma']);

      // A ranked cursor is not a timeline cursor, and the reverse.
      const ranked = await search(actorA, query, { limit: 1 });
      await expect(
        search(actorA, query, {
          cursor: ranked.nextCursor,
          mode: 'timeline',
        }),
      ).rejects.toThrow(InvalidKnowledgeSearchCursorError);
    });

    it('rejects a cursor from another query, filter set or tenant', async () => {
      for (const word of ['alpha', 'bravo', 'charlie']) {
        await note(`Note ${word}`, `Zephyr-9 grinder note about ${word}.`);
      }
      const query = 'Zephyr-9 grinder note';
      const first = await search(actorA, query, { limit: 1 });
      const cursor = first.nextCursor;
      expect(cursor).toBeDefined();

      await expect(
        search(actorA, 'Another-1 query', { cursor, limit: 1 }),
      ).rejects.toThrow(InvalidKnowledgeSearchCursorError);
      await expect(
        search(actorA, query, {
          cursor,
          kinds: [KnowledgeSourceKind.URL],
          limit: 1,
        }),
      ).rejects.toThrow(InvalidKnowledgeSearchCursorError);
      await expect(search(actorB, query, { cursor, limit: 1 })).rejects.toThrow(
        InvalidKnowledgeSearchCursorError,
      );
      await expect(
        search(actorA, query, { cursor: 'not-a-cursor', limit: 1 }),
      ).rejects.toThrow(InvalidKnowledgeSearchCursorError);
    });

    it('never returns another tenant’s passage for an exact name', async () => {
      await capture.capture(actorB, {
        kind: KnowledgeSourceKind.TEXT,
        purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
        scope: KnowledgeMemoryScope.BRAND,
        text: 'Zephyr-9 is our secret codename.',
        title: 'Other tenant codename',
      });

      expect(await search(actorA, 'Zephyr-9 codename')).toEqual({ hits: [] });
    });
  });
});
