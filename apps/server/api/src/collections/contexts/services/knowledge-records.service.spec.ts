import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { toWorkflowActor } from '@api/authorization/brand-access/workflow-actor.util';
import { KnowledgeSourcesController } from '@api/collections/contexts/controllers/knowledge-sources.controller';
import { KnowledgeSpacesController } from '@api/collections/contexts/controllers/knowledge-spaces.controller';
import type { CreateKnowledgeVersionDto } from '@api/collections/contexts/dto/create-knowledge-version.dto';
import { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import {
  buildCaptureVersion,
  KnowledgeCaptureService,
} from '@api/collections/contexts/services/knowledge-capture.service';
import { KnowledgeEmbeddingCompletionService } from '@api/collections/contexts/services/knowledge-embedding-completion.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import { isCloudDeployment } from '@genfeedai/config';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRetentionPolicy,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
  MemberRole,
} from '@genfeedai/contracts';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import { ForbiddenException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Request } from 'express';
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
  '20260917180000_knowledge_refresh_and_transcripts',
  '20260918120000_knowledge_capture_request_hash',
  '20261022090000_context_embedding_queue',
  '20261027070000_agent_memory_revisions',
].map((name) =>
  readFileSync(
    new URL(
      `../../../../../../../packages/prisma/prisma/migrations/${name}/migration.sql`,
      import.meta.url,
    ),
    'utf8',
  ),
);
const actor = {
  id: 'legacyBase62User',
  userId: 'legacyBase62User',
  organizationId: 'org-a',
  brandId: 'brand-a',
  role: MemberRole.ADMIN,
};
const otherBrand = { ...actor, brandId: 'brand-b' };
const otherTenant = { ...actor, organizationId: 'org-b', brandId: 'brand-c' };
const orgActor = { ...actor, brandId: '' };
const anotherUser = {
  ...actor,
  id: 'otherUser',
  role: MemberRole.USER,
  userId: 'otherUser',
};
const capture: CreateKnowledgeVersionDto = {
  contentHash: `sha256:${'a'.repeat(64)}`,
  provenance: { url: 'https://private.example/source', capturedBy: 'browser' },
  payload: { text: 'Sensitive evidence' },
  observedAt: '2026-01-01T00:00:00.000Z',
};

let pool: Pool;
let prisma: PrismaClient;
let records: KnowledgeRecordsService;
let completion: KnowledgeEmbeddingCompletionService;
let schema: string;

function buildSourcesController() {
  const ingestWorkflow = {
    enqueueBackfill: vi.fn().mockResolvedValue('backfill-job'),
    enqueueIngest: vi.fn().mockResolvedValue('ingest-job'),
  };
  return {
    controller: new KnowledgeSourcesController(
      records,
      new KnowledgeCaptureService(
        records,
        ingestWorkflow as never,
        { refresh: vi.fn() } as never,
      ),
      {
        refresh: vi.fn(),
        setPolicy: vi.fn(),
        unscheduleSource: vi.fn(),
      } as never,
    ),
    ingestWorkflow,
  };
}

async function createSource(scope = KnowledgeMemoryScope.BRAND) {
  return records.createSource(actor, {
    scope,
    title: 'Source',
    kind: KnowledgeSourceKind.TEXT,
    purpose: KnowledgeSourcePurpose.RESEARCH,
  });
}

async function ready(sourceId: string, versionId: string) {
  await records.setProcessing(
    actor,
    sourceId,
    versionId,
    KnowledgeProcessingState.PROCESSING,
  );
  await expect(
    records.setProcessing(
      actor,
      sourceId,
      versionId,
      KnowledgeProcessingState.READY,
    ),
  ).rejects.toThrow('incomplete');
  await completion.stage({
    organizationId: actor.organizationId,
    sourceId,
    versionId,
    contextBaseId: 'empty-manifest-has-no-base-rows',
    initiatingActor: toWorkflowActor(actor),
    admissionExecutionId: randomUUID(),
    chunks: [],
    observedValidators: {},
  });
  await expect(
    completion.complete(actor.organizationId, sourceId, versionId),
  ).resolves.toBe('completed');
}

describePostgres('Knowledge collection with PostgreSQL', () => {
  let incomingCloud: string | undefined;
  beforeEach(async () => {
    incomingCloud = process.env.GENFEED_CLOUD;
    vi.stubEnv('GENFEED_CLOUD', 'true');
    expect(isCloudDeployment()).toBe(true);
    schema = `knowledge_collection_${randomUUID().replaceAll('-', '')}`;
    pool = new Pool({
      connectionString: process.env.KNOWLEDGE_TEST_DATABASE_URL,
    });
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}", public`);
      await client.query(`
        CREATE TABLE organizations (id text PRIMARY KEY, "isDeleted" boolean DEFAULT false);
        CREATE TABLE users (id text PRIMARY KEY, "isDeleted" boolean NOT NULL DEFAULT false);
        CREATE TABLE api_keys (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id), "organizationId" text NOT NULL REFERENCES organizations(id), scopes text[] NOT NULL, "isRevoked" boolean NOT NULL DEFAULT false, "expiresAt" TIMESTAMP(3));
        CREATE TABLE agent_memories (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id),
         "userId" text, "brandId" text, "campaignId" text, scope text, content text, type text, kind text, "contentType" text,
         platform text, summary text, tags text[], "sourceType" text, "sourceUrl" text, "sourceContentId" text, "sourceMessageId" text,
         metadata jsonb, importance double precision, confidence double precision, "performanceSnapshot" jsonb, "promotedSkillId" text,
         "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
        CREATE TABLE brands (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "isDeleted" boolean DEFAULT false, UNIQUE(id, "organizationId"));
        INSERT INTO organizations(id) VALUES ('org-a'), ('org-b');
        INSERT INTO users(id) VALUES ('legacyBase62User'), ('otherUser');
        INSERT INTO brands(id, "organizationId") VALUES ('brand-a', 'org-a'), ('brand-b', 'org-a'), ('brand-c', 'org-b');
        CREATE TABLE roles (id text PRIMARY KEY, key text NOT NULL, "isDeleted" boolean NOT NULL DEFAULT false);
        CREATE TABLE members (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "userId" text NOT NULL REFERENCES users(id), "roleId" text NOT NULL REFERENCES roles(id), "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false);
        CREATE TABLE "_member_brands" ("A" text NOT NULL REFERENCES brands(id), "B" text NOT NULL REFERENCES members(id), UNIQUE("A","B"));
        INSERT INTO roles(id,key) VALUES ('admin','admin'),('ordinary','user');
        INSERT INTO members(id,"organizationId","userId","roleId") VALUES ('canonical-admin','org-a','legacyBase62User','admin'),('canonical-member','org-a','otherUser','ordinary');
        INSERT INTO members(id,"organizationId","userId","roleId") VALUES ('canonical-foreign-member','org-b','legacyBase62User','ordinary');
        INSERT INTO "_member_brands"("A","B") VALUES ('brand-c','canonical-foreign-member'),('brand-a','canonical-member');
        INSERT INTO api_keys(id,"userId","organizationId",scopes) VALUES ('knowledge-controller-key','legacyBase62User','org-a',ARRAY['*','admin']);
        CREATE TABLE context_bases (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "createdById" text, "sourceBrandId" text, data jsonb NOT NULL DEFAULT '{}', "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
        CREATE TABLE context_entries (id text PRIMARY KEY, "contextBaseId" text NOT NULL REFERENCES context_bases(id), "organizationId" text NOT NULL REFERENCES organizations(id), data jsonb NOT NULL DEFAULT '{}', "embeddingClaimedAt" timestamptz, "embeddingFailedAt" timestamptz, "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
      `);
      for (const migration of migrations) {
        await client.query(migration);
      }
    } finally {
      await client.query('SET search_path TO public');
      client.release();
    }
    // Prisma qualifies model queries with `schema`; raw SQL inside the
    // service relies on search_path, so the pool pins it as well.
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: process.env.KNOWLEDGE_TEST_DATABASE_URL,
          options: `-c search_path="${schema}",public`,
        },
        { schema },
      ),
    });
    const db = prisma as unknown as PrismaService;
    const policy = brandAccessFixture(db);
    const provider = new ContextEmbeddingProviderService(
      {
        getDefaultModel: vi.fn().mockResolvedValue('fixture-embedding'),
      } as never,
      {
        embeddings: vi
          .fn()
          .mockRejectedValue(
            new Error('Empty Knowledge sources require no provider work'),
          ),
      } as never,
    );
    const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const writer = new ContextEmbeddingWriteService(
      db,
      policy,
      provider,
      queue as never,
      { warn: vi.fn() } as never,
    );
    completion = new KnowledgeEmbeddingCompletionService(
      db,
      writer,
      provider,
      queue as never,
    );
    records = new KnowledgeRecordsService(
      prisma as unknown as PrismaService,
      brandAccessFixture(prisma as unknown as PrismaService as never),
      completion,
    );
  });

  afterEach(async () => {
    try {
      await prisma?.$disconnect();
      if (pool) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool.end();
      }
    } finally {
      vi.unstubAllEnvs();
    }
    expect(process.env.GENFEED_CLOUD).toBe(incomingCloud);
  });

  it('isolates every source/version mutation by organization, active brand and personal owner', async () => {
    const source = await createSource();
    const version = await records.createVersion(actor, source.id, capture);
    for (const denied of [otherBrand, otherTenant, orgActor]) {
      await expect(records.getSource(denied, source.id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        records.getVersion(denied, source.id, version.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        records.updateSource(denied, source.id, { title: 'Intrusion' }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        records.deleteSource(denied, source.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        records.createVersion(denied, source.id, capture),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        records.retryManualCandidate(denied, source.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        records.purgeVersion(denied, source.id, version.id),
      ).rejects.toMatchObject({ status: denied === otherTenant ? 403 : 404 });
      expect((await records.listSources(denied)).docs).toHaveLength(0);
    }
    await expect(
      records.getSource(
        { ...anotherUser, organizationId: 'org-b', brandId: 'brand-c' },
        source.id,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      records.getSource({ ...anotherUser, brandId: 'brand-b' }, source.id),
    ).rejects.toMatchObject({ status: 403 });
    const personal = await createSource(KnowledgeMemoryScope.PERSONAL);
    await expect(
      records.getSource(anotherUser, personal.id),
    ).rejects.toMatchObject({ status: 404 });
    expect((await records.getSource(actor, personal.id)).userId).toBe(
      'legacyBase62User',
    );
    const shared = await createSource(KnowledgeMemoryScope.ORG);
    expect((await records.getSource(orgActor, shared.id)).id).toBe(shared.id);
  });

  it('blocks purge and erasure while a legal hold is set and erases payloads without leaking content', async () => {
    const source = await createSource();
    const version = await records.createVersion(actor, source.id, capture);
    await records.setLegalHold(actor, source.id, version.id, true);
    await expect(
      records.purgeVersion(actor, source.id, version.id),
    ).rejects.toThrow('legal hold');
    await expect(
      records.eraseVersion(actor, source.id, version.id),
    ).rejects.toThrow('legal hold');
    await records.setLegalHold(actor, source.id, version.id, false);
    const erased = await records.eraseVersion(actor, source.id, version.id);
    expect(erased).toMatchObject({
      payload: null,
      provenance: null,
      retentionState: KnowledgeRetentionState.POLICY_ERASED,
    });
    await expect(
      records.purgeVersion(anotherUser, source.id, version.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('atomically deduplicates concurrent extension retries and conflicts on changed requests', async () => {
    const dto = {
      scope: KnowledgeMemoryScope.BRAND,
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.RESEARCH,
      title: 'Extension capture',
      text: 'Visible evidence',
    };
    const version = buildCaptureVersion(dto);
    const captures = await Promise.all(
      Array.from({ length: 4 }, () =>
        records.createIdempotentCapture(
          actor,
          dto,
          version,
          'capture-key-123',
          'request-a',
        ),
      ),
    );
    expect(new Set(captures.map((item) => item.source.id)).size).toBe(1);
    expect(new Set(captures.map((item) => item.version.id)).size).toBe(1);
    expect((await records.listSources(actor)).docs).toHaveLength(1);
    await expect(
      records.createIdempotentCapture(
        actor,
        { ...dto, text: 'Changed' },
        version,
        'capture-key-123',
        'request-b',
      ),
    ).rejects.toThrow('different or purged content');
    const other = await records.createIdempotentCapture(
      otherBrand,
      dto,
      version,
      'capture-key-123',
      'request-a',
    );
    expect(other.source.id).not.toBe(captures[0]?.source.id);
    const otherUserCapture = await records.createIdempotentCapture(
      anotherUser,
      dto,
      version,
      'capture-key-123',
      'request-a',
    );
    expect(otherUserCapture.source.id).not.toBe(captures[0]?.source.id);
    const firstCapture = captures[0];
    if (!firstCapture) throw new Error('Expected an initial capture');
    await records.deleteSource(actor, firstCapture.source.id);
    await expect(
      records.createIdempotentCapture(
        actor,
        dto,
        version,
        'capture-key-123',
        'request-a',
      ),
    ).rejects.toThrow('removed source');
  });

  it('creates one Inbox under concurrent first captures and keeps memberships idempotent', async () => {
    const inboxes = await Promise.all(
      Array.from({ length: 4 }, () =>
        records.ensureInbox(actor, KnowledgeMemoryScope.BRAND),
      ),
    );
    expect(new Set(inboxes.map((inbox) => inbox.id)).size).toBe(1);
    const sources = await Promise.all(
      Array.from({ length: 3 }, () => createSource()),
    );
    const inbox = inboxes[0];
    expect(inbox).toBeDefined();
    if (!inbox) return;
    expect(await records.listMemberships(actor, inbox.id)).toHaveLength(3);
    const first = sources[0];
    if (!first) throw new Error('Missing source');
    const original = await records.setMembership(
      actor,
      first.id,
      inbox.id,
      false,
    );
    const repeated = await records.setMembership(
      actor,
      first.id,
      inbox.id,
      false,
    );
    expect(repeated.id).toBe(original.id);
    await records.setMembership(actor, first.id, inbox.id, true);
    expect(await records.listMemberships(actor, inbox.id)).toHaveLength(2);
    await records.setMembership(actor, first.id, inbox.id, false);
    expect(await records.listMemberships(actor, inbox.id)).toHaveLength(3);
    await expect(records.deleteSpace(actor, inbox.id)).rejects.toThrow('Inbox');
  });

  it('rejects cross-brand and scope-widening memberships and preserves sources on space removal', async () => {
    const source = await createSource();
    const space = await records.createSpace(actor, {
      scope: KnowledgeMemoryScope.BRAND,
      title: 'Research',
    });
    const foreign = await records.createSpace(otherBrand, {
      scope: KnowledgeMemoryScope.BRAND,
      title: 'Other brand',
    });
    const shared = await records.createSpace(actor, {
      scope: KnowledgeMemoryScope.ORG,
      title: 'Shared',
    });
    await expect(
      records.setMembership(actor, source.id, foreign.id, false),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      records.setMembership(actor, source.id, shared.id, false),
    ).rejects.toThrow('same ownership');
    await records.setMembership(actor, source.id, space.id, false);
    await expect(records.getSpace(otherBrand, space.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      records.deleteSpace(otherBrand, space.id),
    ).rejects.toMatchObject({ status: 404 });
    expect((await records.updateSpace(actor, space.id, 'Renamed')).title).toBe(
      'Renamed',
    );
    await expect(
      records.updateSpace(otherBrand, space.id, 'Intrusion'),
    ).rejects.toMatchObject({ status: 404 });
    await records.deleteSpace(actor, space.id);
    await expect(
      records.setMembership(actor, source.id, space.id, false),
    ).rejects.toMatchObject({ status: 404 });
    expect((await records.getSource(actor, source.id)).isDeleted).toBe(false);
  });

  it('serializes concurrent versions and preserves historical receipts after supersession and purge', async () => {
    const source = await createSource();
    const historical = await records.createVersion(actor, source.id, capture);
    await ready(source.id, historical.id);
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        records.createVersion(actor, source.id, {
          ...capture,
          contentHash: 'sha256:' + String(i).repeat(64),
        }),
      ),
    );
    const accepted = attempts.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    expect(accepted).toHaveLength(1);
    for (const result of attempts)
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({ status: 409 });
    const current = accepted[0];
    if (!current) throw new Error('Missing candidate');
    expect(current).toMatchObject({ version: 2, isCurrent: false });
    expect((await records.getCurrentVersion(actor, source.id)).id).toBe(
      historical.id,
    );
    await ready(source.id, current.id);
    const receipt = await records.getVersion(actor, source.id, historical.id);
    expect(
      (await records.listVersions(actor, source.id)).docs.map(
        (version) => version.version,
      ),
    ).toEqual([2, 1]);
    await expect(
      records.listVersions(otherBrand, source.id),
    ).rejects.toMatchObject({ status: 404 });
    expect(receipt.isCurrent).toBe(false);
    expect(receipt.retrievalState).toBe(KnowledgeRetrievalState.SUPERSEDED);
    expect(receipt.supersededByVersionId).not.toBeNull();
    const purged = await records.purgeVersion(actor, source.id, historical.id);
    expect(purged).toMatchObject({
      id: receipt.id,
      sourceId: receipt.sourceId,
      version: receipt.version,
      contentHash: receipt.contentHash,
      payload: null,
      provenance: null,
      retentionState: KnowledgeRetentionState.PAYLOAD_PURGED,
    });
    expect(
      (await records.purgeVersion(actor, source.id, historical.id)).purgedAt,
    ).toEqual(purged.purgedAt);
    expect(
      (await records.listEligibleVersions(actor)).docs.map(
        (version) => version.id,
      ),
    ).toEqual([current.id]);
    await expect(
      records.setEligibility(
        actor,
        source.id,
        historical.id,
        KnowledgeRetrievalState.ACTIVE,
      ),
    ).rejects.toThrow('Supersession');
  });

  it('retires derived chunks on source deletion and payload purge and keeps failure reasons only while failed', async () => {
    const source = await createSource();
    const version = await records.createVersion(actor, source.id, capture);
    const base = await prisma.contextBase.create({
      data: {
        organizationId: 'org-a',
        sourceBrandId: 'brand-a',
        data: { entryCount: 2, purpose: 'knowledge-base' },
      },
    });
    const link = {
      contextBaseId: base.id,
      organizationId: 'org-a',
      knowledgeSourceId: source.id,
      knowledgeSourceVersionId: version.id,
    };
    await prisma.contextEntry.createMany({
      data: [
        { ...link, data: { content: 'one' } },
        { ...link, data: { content: 'two' } },
      ],
    });
    await expect(
      prisma.contextEntry.create({
        data: { ...link, organizationId: 'org-b', contextBaseId: base.id },
      }),
    ).rejects.toThrow();

    await records.setProcessing(
      actor,
      source.id,
      version.id,
      KnowledgeProcessingState.PROCESSING,
    );
    const failed = await records.setProcessing(
      actor,
      source.id,
      version.id,
      KnowledgeProcessingState.FAILED,
      'Source did not contain extractable text',
    );
    expect(failed.processingError).toBe(
      'Source did not contain extractable text',
    );
    const requeued = await records.setProcessing(
      actor,
      source.id,
      version.id,
      KnowledgeProcessingState.QUEUED,
    );
    expect(requeued.processingError).toBeNull();
    expect((await records.getCurrentVersion(actor, source.id)).id).toBe(
      version.id,
    );
    await expect(
      records.getCurrentVersion(otherBrand, source.id),
    ).rejects.toMatchObject({ status: 404 });

    await records.purgeVersion(actor, source.id, version.id);
    expect(
      await prisma.contextEntry.count({
        where: { knowledgeSourceVersionId: version.id, isDeleted: false },
      }),
    ).toBe(0);
    expect(
      (await prisma.contextBase.findUniqueOrThrow({ where: { id: base.id } }))
        .data,
    ).toMatchObject({ entryCount: 0 });

    const next = await records.createVersion(actor, source.id, {
      ...capture,
      contentHash: `sha256:${'b'.repeat(64)}`,
    });
    await prisma.contextEntry.create({
      data: {
        ...link,
        knowledgeSourceVersionId: next.id,
        data: { content: 'three' },
      },
    });
    await records.deleteSource(actor, source.id);
    expect(
      await prisma.contextEntry.count({
        where: { knowledgeSourceId: source.id, isDeleted: false },
      }),
    ).toBe(0);
  });

  it('excludes every non-active, unready, hidden, expired, purge-scheduled and purged version by default', async () => {
    const source = await createSource();
    const version = await records.createVersion(actor, source.id, capture);
    expect((await records.listEligibleVersions(actor)).docs).toHaveLength(0);
    await expect(
      records.setProcessing(
        actor,
        source.id,
        version.id,
        KnowledgeProcessingState.READY,
      ),
    ).rejects.toThrow('Invalid processing');
    await records.setProcessing(
      actor,
      source.id,
      version.id,
      KnowledgeProcessingState.PROCESSING,
    );
    await records.setProcessing(
      actor,
      source.id,
      version.id,
      KnowledgeProcessingState.FAILED,
    );
    expect((await records.listEligibleVersions(actor)).docs).toHaveLength(0);
    await records.setProcessing(
      actor,
      source.id,
      version.id,
      KnowledgeProcessingState.QUEUED,
    );
    await ready(source.id, version.id);
    expect((await records.listEligibleVersions(actor)).docs).toHaveLength(1);
    for (const state of [
      KnowledgeRetrievalState.STALE,
      KnowledgeRetrievalState.CONTRADICTED,
      KnowledgeRetrievalState.QUARANTINED,
      KnowledgeRetrievalState.EXPIRED,
    ]) {
      await records.setEligibility(actor, source.id, version.id, state);
      expect((await records.listEligibleVersions(actor)).docs).toHaveLength(0);
      expect(
        (await records.getVersion(actor, source.id, version.id))
          .processingState,
      ).toBe(KnowledgeProcessingState.READY);
    }
    await records.setEligibility(
      actor,
      source.id,
      version.id,
      KnowledgeRetrievalState.ACTIVE,
    );
    await records.updateSource(actor, source.id, { isVisible: false });
    expect((await records.listEligibleVersions(actor)).docs).toHaveLength(0);
    await records.updateSource(actor, source.id, { isVisible: true });
    await records.schedulePurge(
      actor,
      source.id,
      version.id,
      new Date().toISOString(),
    );
    expect((await records.listEligibleVersions(actor)).docs).toHaveLength(0);
    await records.purgeVersion(actor, source.id, version.id);
    await expect(
      records.setEligibility(
        actor,
        source.id,
        version.id,
        KnowledgeRetrievalState.ACTIVE,
      ),
    ).rejects.toThrow('cannot be activated');
    expect((await records.listEligibleVersions(actor)).docs).toHaveLength(0);
    const expired = await records.createVersion(actor, source.id, {
      ...capture,
      expiresAt: '2026-02-01T00:00:00.000Z',
    });
    await expect(ready(source.id, expired.id)).rejects.toThrow('expired');
    expect((await records.listEligibleVersions(actor)).docs).toHaveLength(0);
  });

  it('validates freshness and retention requirements, and excludes deleted parents', async () => {
    const source = await createSource();
    await expect(
      records.createVersion(actor, source.id, {
        ...capture,
        retentionPolicy: KnowledgeRetentionPolicy.UNTIL_EXPIRY,
      }),
    ).rejects.toThrow('Expiry retention');
    const version = await records.createVersion(actor, source.id, capture);
    await expect(
      records.verifyVersion(
        actor,
        source.id,
        version.id,
        '2025-01-01T00:00:00.000Z',
      ),
    ).rejects.toThrow('between capture');
    await expect(
      records.verifyVersion(
        actor,
        source.id,
        version.id,
        '2026-02-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ),
    ).rejects.toThrow('Expiry must follow');
    const verified = await records.verifyVersion(
      actor,
      source.id,
      version.id,
      '2026-02-01T00:00:00.000Z',
      '2099-01-01T00:00:00.000Z',
    );
    expect(verified.verifiedAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));
    await ready(source.id, version.id);
    await records.deleteSource(actor, source.id);
    await expect(records.getSource(actor, source.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      records.getVersion(actor, source.id, version.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      records.createVersion(actor, source.id, capture),
    ).rejects.toMatchObject({ status: 404 });
    expect((await records.listEligibleVersions(actor)).docs).toHaveLength(0);
  });

  it('discovers every eligible version across pages with serialized totals', async () => {
    const ids = Array.from({ length: 101 }, (_, index) =>
      String(index).padStart(3, '0'),
    );
    await prisma.knowledgeSource.createMany({
      data: ids.map((id) => ({
        id: `source-${id}`,
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        userId: actor.userId,
        scope: KnowledgeMemoryScope.BRAND,
        title: `Evidence ${id}`,
        kind: KnowledgeSourceKind.TEXT,
        purpose: KnowledgeSourcePurpose.RESEARCH,
      })),
    });
    await prisma.knowledgeSourceVersion.createMany({
      data: ids.map((id) => ({
        id: `version-${id}`,
        sourceId: `source-${id}`,
        organizationId: actor.organizationId,
        version: 1,
        contentHash: `sha256:${id}`,
        provenance: {},
        observedAt: new Date(capture.observedAt),
        processingState: KnowledgeProcessingState.QUEUED,
      })),
    });
    for (const id of ids) await ready('source-' + id, 'version-' + id);
    const first = await records.listEligibleVersions(actor, 1, 100);
    const second = await records.listEligibleVersions(actor, 2, 100);
    expect(first).toMatchObject({
      totalDocs: 101,
      totalPages: 2,
      page: 1,
      limit: 100,
    });
    expect(first.docs).toHaveLength(100);
    expect(second.docs.map((row) => row.id)).toEqual(['version-100']);
    expect([...first.docs, ...second.docs].map((row) => row.id)).toEqual(
      ids.map((id) => `version-${id}`),
    );
    const controller = buildSourcesController().controller;
    const response = await controller.eligible(
      {
        originalUrl:
          '/knowledge-sources/eligible-versions?page=2&limit=100&brandId=brand-a',
      } as Request,
      actor,
      { page: 2, limit: 100 },
      actor.brandId,
    );
    expect(response).toMatchObject({
      data: [{ id: 'version-100' }],
      links: { pagination: { total: 101, pages: 2, page: 2, limit: 100 } },
    });
  });

  it('exposes serialized collection APIs while propagating the authenticated actor', async () => {
    const { controller: sources, ingestWorkflow } = buildSourcesController();
    const spaces = new KnowledgeSpacesController(records);
    const request = { originalUrl: '/knowledge-sources' } as Request;
    const source = await createSource();
    const response = await sources.find(
      request,
      actor,
      source.id,
      actor.brandId,
    );
    expect(response).toMatchObject({
      data: {
        id: source.id,
        type: 'knowledge-source',
        attributes: {
          title: 'Source',
          scope: 'brand',
          organizationId: 'org-a',
        },
      },
    });
    await expect(
      sources.find(request, otherBrand, source.id),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await sources.find(request, otherBrand, source.id, actor.brandId),
    ).toMatchObject({ data: { id: source.id } });
    const apiKeyUser = {
      ...actor,
      brandId: actor.organizationId,
      isApiKey: true,
      apiKeyId: 'knowledge-controller-key',
      scopes: ['*', 'admin'],
    };
    await expect(
      sources.find(
        request,
        { ...apiKeyUser, apiKeyId: undefined },
        source.id,
        actor.brandId,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      sources.find(
        request,
        { ...apiKeyUser, apiKeyId: 'nonexistent-controller-key' },
        source.id,
        actor.brandId,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await sources.find(request, apiKeyUser, source.id, actor.brandId),
    ).toMatchObject({ data: { id: source.id } });
    await expect(
      sources.find(request, apiKeyUser, source.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      sources.create(
        request,
        apiKeyUser,
        {
          scope: KnowledgeMemoryScope.BRAND,
          title: 'Bad tenant',
          kind: KnowledgeSourceKind.TEXT,
          purpose: KnowledgeSourcePurpose.RESEARCH,
        },
        otherTenant.brandId,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const inboxResponse = await spaces.inbox(
      request,
      actor,
      {
        scope: KnowledgeMemoryScope.BRAND,
      },
      actor.brandId,
    );
    expect(inboxResponse).toMatchObject({
      data: { type: 'knowledge-space', attributes: { isInbox: true } },
    });
    const captured = await sources.create(
      request,
      actor,
      {
        scope: KnowledgeMemoryScope.BRAND,
        title: 'Pricing',
        kind: KnowledgeSourceKind.TEXT,
        purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
        text: 'Plans start at $29.',
      },
      actor.brandId,
    );
    expect(captured).toMatchObject({
      data: { type: 'knowledge-source', attributes: { title: 'Pricing' } },
      jobId: 'ingest-job',
    });
    const capturedId = captured.data?.id;
    if (!capturedId) throw new Error('Capture did not return a source');
    expect(ingestWorkflow.enqueueIngest).toHaveBeenCalledWith({
      organizationId: 'org-a',
      sourceId: capturedId,
      versionId: captured.versionId,
      initiatingActor: {
        userId: actor.userId,
        organizationId: actor.organizationId,
        isApiKey: false,
        scopes: [],
      },
    });
    const current = await records.getCurrentVersion(actor, capturedId);
    expect(current).toMatchObject({
      id: captured.versionId,
      payload: { text: 'Plans start at $29.' },
      processingState: KnowledgeProcessingState.QUEUED,
    });
    await expect(
      sources.retry(request, actor, capturedId, actor.brandId),
    ).resolves.toMatchObject({ jobId: 'ingest-job' });
    expect(ingestWorkflow.enqueueIngest).toHaveBeenCalledTimes(2);
  });
});

describe('Manual version predecessor admission', () => {
  function admission() {
    const current = { id: 'current', version: 2, isCurrent: true };
    const latest = {
      id: 'historical',
      version: 5,
      isCurrent: false,
      processingState: 'FAILED',
      embeddingGeneration: 3,
    };
    const tx = {
      knowledgeSource: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      knowledgeSourceVersion: {
        findFirst: vi
          .fn()
          .mockImplementation(
            async ({ where }: Prisma.KnowledgeSourceVersionFindFirstArgs) =>
              where?.isCurrent ? current : latest,
          ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi
          .fn()
          .mockImplementation(
            async ({ data }: Prisma.KnowledgeSourceVersionUpdateArgs) => ({
              ...latest,
              ...data,
            }),
          ),
        create: vi
          .fn()
          .mockImplementation(
            async ({ data }: Prisma.KnowledgeSourceVersionCreateArgs) => data,
          ),
      },
      knowledgeSourceRefreshRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'run' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const completion = new KnowledgeEmbeddingCompletionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(completion, 'processingUpdate').mockResolvedValue({
      processingState: 'QUEUED',
      processingError: null,
    });
    const prisma = {
      $transaction: vi.fn(
        async <T>(work: (transaction: typeof tx) => Promise<T>) => work(tx),
      ),
    };
    const records = new KnowledgeRecordsService(
      prisma as never,
      { resolve: vi.fn(), assert: vi.fn() } as never,
      completion as never,
    );
    return { current, latest, tx, records, completion };
  }

  it('keeps the actual predecessor current and fences a noncurrent candidate without retiring chunks', async () => {
    const { records, tx } = admission();
    const version = await records.createVersion(actor, 'source', capture);
    expect(version).toMatchObject({
      isCurrent: false,
      processingState: 'QUEUED',
      version: 6,
    });
    expect(tx.knowledgeSourceVersion.updateMany).not.toHaveBeenCalled();
    expect(tx.knowledgeSourceRefreshRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateVersionId: version.id,
        expectedCurrentVersionId: 'current',
        tickKey: 'manual-version:' + version.id,
        status: 'PROCESSING',
      }),
    });
  });

  it('rejects competing unfinished work before version admission', async () => {
    const { records, tx } = admission();
    tx.knowledgeSourceRefreshRun.findFirst.mockResolvedValue({ id: 'busy' });
    await expect(
      records.createVersion(actor, 'source', capture),
    ).rejects.toThrow('in progress');
    expect(tx.knowledgeSourceVersion.create).not.toHaveBeenCalled();
  });

  it('keeps the no-current initial path even with older historical numbering', async () => {
    const { records, tx, latest } = admission();
    tx.knowledgeSourceVersion.findFirst.mockImplementation(
      async ({ where }: Prisma.KnowledgeSourceVersionFindFirstArgs) =>
        where?.isCurrent ? null : latest,
    );
    await expect(
      records.createVersion(actor, 'source', capture),
    ).resolves.toMatchObject({ isCurrent: true, version: 6 });
    expect(tx.knowledgeSourceRefreshRun.create).not.toHaveBeenCalled();
  });
  it('reopens the same failed manual candidate and preserves its generation for actual ingest admission', async () => {
    const { records, tx, completion } = admission();
    tx.knowledgeSourceRefreshRun.findFirst
      .mockResolvedValueOnce({
        id: 'run',
        status: 'FAILED',
        expectedCurrentVersionId: 'current',
      })
      .mockResolvedValueOnce(null);
    await expect(
      records.retryManualCandidate(actor, 'source'),
    ).resolves.toMatchObject({
      id: 'historical',
      embeddingGeneration: 3,
      processingState: 'QUEUED',
    });
    expect(tx.knowledgeSourceRefreshRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'FAILED',
          expectedCurrentVersionId: 'current',
          candidateVersionId: 'historical',
        }),
        data: expect.objectContaining({ status: 'PROCESSING', error: null }),
      }),
    );
    expect(completion.processingUpdate).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'historical' }),
      'QUEUED',
    );
  });

  it.each(['stale-predecessor', 'competing-run', 'live-candidate', 'lost-cas'])(
    'rejects %s manual retries without updating the version',
    async (condition) => {
      const { records, tx } = admission();
      tx.knowledgeSourceRefreshRun.findFirst
        .mockResolvedValueOnce({
          id: 'run',
          status: condition === 'live-candidate' ? 'PROCESSING' : 'FAILED',
          expectedCurrentVersionId:
            condition === 'stale-predecessor' ? 'obsolete' : 'current',
        })
        .mockResolvedValueOnce(
          condition === 'competing-run' ? { id: 'other' } : null,
        );
      if (condition === 'lost-cas')
        tx.knowledgeSourceRefreshRun.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        records.retryManualCandidate(actor, 'source'),
      ).rejects.toThrow();
      expect(tx.knowledgeSourceVersion.update).not.toHaveBeenCalled();
    },
  );

  it('does not select an older failed manual run when a newer version has no manual fence', async () => {
    const { records, tx } = admission();
    await expect(
      records.retryManualCandidate(actor, 'source'),
    ).resolves.toBeNull();
    expect(tx.knowledgeSourceRefreshRun.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        candidateVersionId: 'historical',
        tickKey: 'manual-version:historical',
      }),
    });
    expect(tx.knowledgeSourceRefreshRun.updateMany).not.toHaveBeenCalled();
  });
});
