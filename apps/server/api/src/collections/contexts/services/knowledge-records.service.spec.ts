import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { KnowledgeSourcesController } from '@api/collections/contexts/controllers/knowledge-sources.controller';
import { KnowledgeSpacesController } from '@api/collections/contexts/controllers/knowledge-spaces.controller';
import type { CreateKnowledgeVersionDto } from '@api/collections/contexts/dto/create-knowledge-version.dto';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRetentionPolicy,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Request } from 'express';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

const describePostgres = process.env.KNOWLEDGE_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const migration = readFileSync(
  new URL(
    '../../../../../../../packages/prisma/prisma/migrations/20260904230000_knowledge_source_space_contracts/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const actor = {
  id: 'legacyBase62User',
  userId: 'legacyBase62User',
  organizationId: 'org-a',
  brandId: 'brand-a',
};
const otherBrand = { ...actor, brandId: 'brand-b' };
const otherTenant = { ...actor, organizationId: 'org-b', brandId: 'brand-c' };
const orgActor = { ...actor, brandId: '' };
const anotherUser = { ...actor, id: 'otherUser', userId: 'otherUser' };
const capture: CreateKnowledgeVersionDto = {
  contentHash: `sha256:${'a'.repeat(64)}`,
  provenance: { url: 'https://private.example/source', capturedBy: 'browser' },
  payload: { text: 'Sensitive evidence' },
  observedAt: '2026-01-01T00:00:00.000Z',
};

let pool: Pool;
let prisma: PrismaClient;
let records: KnowledgeRecordsService;
let schema: string;

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
  await records.setProcessing(
    actor,
    sourceId,
    versionId,
    KnowledgeProcessingState.READY,
  );
}

describePostgres('Knowledge collection with PostgreSQL', () => {
  beforeEach(async () => {
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
        CREATE TABLE users (id text PRIMARY KEY);
        CREATE TABLE brands (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "isDeleted" boolean DEFAULT false, UNIQUE(id, "organizationId"));
        INSERT INTO organizations(id) VALUES ('org-a'), ('org-b');
        INSERT INTO users(id) VALUES ('legacyBase62User'), ('otherUser');
        INSERT INTO brands(id, "organizationId") VALUES ('brand-a', 'org-a'), ('brand-b', 'org-a'), ('brand-c', 'org-b');
      `);
      await client.query(migration);
    } finally {
      await client.query('SET search_path TO public');
      client.release();
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: process.env.KNOWLEDGE_TEST_DATABASE_URL },
        { schema },
      ),
    });
    records = new KnowledgeRecordsService(prisma as unknown as PrismaService);
  });

  afterEach(async () => {
    await prisma?.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
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
        records.purgeVersion(denied, source.id, version.id),
      ).rejects.toMatchObject({ status: 404 });
      expect((await records.listSources(denied)).docs).toHaveLength(0);
    }
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
    await records.deleteSpace(actor, space.id);
    await expect(
      records.setMembership(actor, source.id, space.id, false),
    ).rejects.toMatchObject({ status: 404 });
    expect((await records.getSource(actor, source.id)).isDeleted).toBe(false);
  });

  it('serializes concurrent versions and preserves historical receipts after supersession and purge', async () => {
    const source = await createSource();
    const versions = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        records.createVersion(actor, source.id, {
          ...capture,
          contentHash: `sha256:${String(i).repeat(64)}`,
        }),
      ),
    );
    expect(versions.map((version) => version.version).sort()).toEqual([
      1, 2, 3, 4,
    ]);
    const historical = versions.find((version) => version.version === 1);
    const current = versions.find((version) => version.version === 4);
    if (!historical || !current) throw new Error('Missing versions');
    const receipt = await records.getVersion(actor, source.id, historical.id);
    expect(receipt.isCurrent).toBe(false);
    expect(receipt.retrievalState).toBe(KnowledgeRetrievalState.SUPERSEDED);
    expect(receipt.supersededByVersionId).not.toBeNull();
    await ready(source.id, current.id);
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
      (await records.listEligibleVersions(actor)).map((version) => version.id),
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

  it('excludes every non-active, unready, hidden, expired, purge-scheduled and purged version by default', async () => {
    const source = await createSource();
    const version = await records.createVersion(actor, source.id, capture);
    expect(await records.listEligibleVersions(actor)).toHaveLength(0);
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
    expect(await records.listEligibleVersions(actor)).toHaveLength(0);
    await records.setProcessing(
      actor,
      source.id,
      version.id,
      KnowledgeProcessingState.QUEUED,
    );
    await ready(source.id, version.id);
    expect(await records.listEligibleVersions(actor)).toHaveLength(1);
    for (const state of [
      KnowledgeRetrievalState.STALE,
      KnowledgeRetrievalState.CONTRADICTED,
      KnowledgeRetrievalState.QUARANTINED,
      KnowledgeRetrievalState.EXPIRED,
    ]) {
      await records.setEligibility(actor, source.id, version.id, state);
      expect(await records.listEligibleVersions(actor)).toHaveLength(0);
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
    expect(await records.listEligibleVersions(actor)).toHaveLength(0);
    await records.updateSource(actor, source.id, { isVisible: true });
    await records.schedulePurge(
      actor,
      source.id,
      version.id,
      new Date().toISOString(),
    );
    expect(await records.listEligibleVersions(actor)).toHaveLength(0);
    await records.purgeVersion(actor, source.id, version.id);
    await expect(
      records.setEligibility(
        actor,
        source.id,
        version.id,
        KnowledgeRetrievalState.ACTIVE,
      ),
    ).rejects.toThrow('cannot be activated');
    expect(await records.listEligibleVersions(actor)).toHaveLength(0);
    const expired = await records.createVersion(actor, source.id, {
      ...capture,
      expiresAt: '2026-02-01T00:00:00.000Z',
    });
    await ready(source.id, expired.id);
    expect(await records.listEligibleVersions(actor)).toHaveLength(0);
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
    expect(await records.listEligibleVersions(actor)).toHaveLength(0);
  });

  it('exposes serialized collection APIs while propagating the authenticated actor', async () => {
    const sources = new KnowledgeSourcesController(records);
    const spaces = new KnowledgeSpacesController(records);
    const request = { originalUrl: '/knowledge-sources' } as Request;
    const source = await createSource();
    const response = await sources.find(request, actor, source.id);
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
    const inboxResponse = await spaces.inbox(request, actor, {
      scope: KnowledgeMemoryScope.BRAND,
    });
    expect(inboxResponse).toMatchObject({
      data: { type: 'knowledge-space', attributes: { isInbox: true } },
    });
  });
});
