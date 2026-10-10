import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { KnowledgeSourceIngestService } from '@api/collections/contexts/services/knowledge-source-ingest.service';
import { toKnowledgeWorkflowActor } from '@api/collections/contexts/utils/knowledge-workflow-actor.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeMemoryScope,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));
const actorA: KnowledgeActor = {
  userId: 'opaque-a',
  organizationId: 'org-a',
  brandId: 'brand-a',
};
const actorB: KnowledgeActor = {
  userId: 'opaque-b',
  organizationId: 'org-a',
  brandId: 'brand-b',
};
const admin: KnowledgeActor = { userId: 'admin-a', organizationId: 'org-a' };
const migrations = [
  '20260904230000_knowledge_source_space_contracts',
  '20260906210000_knowledge_chunks_link_versions',
  '20260910180000_knowledge_version_legal_hold',
  '20260917180000_knowledge_refresh_and_transcripts',
  '20260918120000_knowledge_capture_request_hash',
].map((name) =>
  readFileSync(
    new URL(
      `../../../../../../packages/prisma/prisma/migrations/${name}/migration.sql`,
      import.meta.url,
    ),
    'utf8',
  ),
);
const fixtureSql = `
CREATE TABLE organizations (id text PRIMARY KEY, "isDeleted" boolean NOT NULL DEFAULT false);
CREATE TABLE users (id text PRIMARY KEY);
CREATE TABLE api_keys (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id), "organizationId" text NOT NULL REFERENCES organizations(id), scopes text[] NOT NULL, "isRevoked" boolean NOT NULL DEFAULT false, "expiresAt" TIMESTAMP(3));
CREATE TABLE roles (id text PRIMARY KEY, key text NOT NULL, "isDeleted" boolean NOT NULL DEFAULT false);
CREATE TABLE brands (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "isDeleted" boolean NOT NULL DEFAULT false, UNIQUE(id,"organizationId"));
CREATE TABLE members (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "userId" text NOT NULL REFERENCES users(id), "roleId" text NOT NULL REFERENCES roles(id), "roleKey" text, "currentBrandId" text NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false);
CREATE TABLE "_member_brands" ("A" text NOT NULL REFERENCES brands(id), "B" text NOT NULL REFERENCES members(id), UNIQUE("A","B"));
CREATE TABLE context_entries (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "isDeleted" boolean NOT NULL DEFAULT false, "updatedAt" timestamptz NOT NULL DEFAULT now(), "embeddingClaimedAt" timestamptz, "embeddingFailedAt" timestamptz);
INSERT INTO organizations(id,"isDeleted") VALUES ('org-a',false),('org-b',false),('deleted-org',true);
INSERT INTO users(id) VALUES ('opaque-a'),('opaque-b'),('admin-a'),('admin-b'),('owner-a'),('foreign-user'),('deleted-user');
INSERT INTO api_keys(id,"userId","organizationId",scopes) VALUES ('key-a','opaque-a','org-a',ARRAY['*','admin']);
INSERT INTO roles(id,key) VALUES ('ordinary','user'),('admin','admin'),('owner','owner');
INSERT INTO brands(id,"organizationId","isDeleted") VALUES ('brand-a','org-a',false),('brand-b','org-a',false),('deleted-brand','org-a',true),('foreign-brand','org-b',false),('deleted-org-brand','deleted-org',false);
INSERT INTO members(id,"organizationId","userId","roleId","roleKey","currentBrandId") VALUES ('member-a','org-a','opaque-a','ordinary','OWNER','brand-a'),('member-b','org-a','opaque-b','ordinary','ADMIN','brand-b'),('admin-a','org-a','admin-a','admin',null,'brand-a'),('admin-b','org-a','admin-b','admin',null,'brand-a'),('owner-a','org-a','owner-a','owner',null,'brand-a'),('foreign-member','org-b','foreign-user','owner',null,'foreign-brand'),('deleted-member','deleted-org','deleted-user','owner',null,'deleted-org-brand');
INSERT INTO "_member_brands"("A","B") VALUES ('brand-a','member-a'),('brand-b','member-b'),('foreign-brand','member-a'),('deleted-brand','member-a');
`;
describe('mandatory Cloud brand authorization with real PostgreSQL and Prisma', () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let schema: string;
  let policy: BrandAccessService;
  let records: KnowledgeRecordsService;
  let ingest: KnowledgeSourceIngestService;
  const embeddings = vi.fn();
  beforeAll(async () => {
    const connectionString = process.env.KNOWLEDGE_TEST_DATABASE_URL;
    if (!connectionString)
      throw new Error(
        'KNOWLEDGE_TEST_DATABASE_URL must identify an isolated test database for #5147',
      );
    pool = new Pool({ connectionString });
    schema = `cloud_brand_${randomUUID().replaceAll('-', '')}`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}",public`);
      await client.query(fixtureSql);
      for (const migration of migrations) await client.query(migration);
    } finally {
      await client.query('SET search_path TO public');
      client.release();
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, options: `-c search_path="${schema}",public` },
        { schema },
      ),
    });
    const db = prisma as unknown as PrismaService;
    policy = new BrandAccessService(db);
    records = new KnowledgeRecordsService(db, policy);
    ingest = new KnowledgeSourceIngestService(
      db,
      { addEntry: embeddings } as never,
      policy,
      records,
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    if (pool) {
      if (schema) await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });
  beforeEach(async () => {
    embeddings.mockClear();
    await pool.query(
      `UPDATE "${schema}".api_keys SET scopes=ARRAY['*','admin'],"isRevoked"=false,"expiresAt"=null WHERE id='key-a'`,
    );
    await pool.query(
      `UPDATE "${schema}".members SET "isActive"=true,"isDeleted"=false,"roleId"='ordinary' WHERE id='member-a'`,
    );
    await pool.query(
      `INSERT INTO "${schema}"."_member_brands"("A","B") VALUES ('brand-a','member-a') ON CONFLICT DO NOTHING`,
    );
  });
  it('filters live assignments before rows, totals, pagination and included roster relations', async () => {
    const where = await policy.predicate(actorA);
    expect(
      await prisma.brand.findMany({ where, select: { id: true }, take: 1 }),
    ).toEqual([{ id: 'brand-a' }]);
    expect(await prisma.brand.count({ where })).toBe(1);
    expect(
      await prisma.brand.count({ where: await policy.predicate(admin) }),
    ).toBe(2);
    const members = await prisma.member.findMany({
      where: { organizationId: 'org-a', isDeleted: false },
      select: { brands: { where, select: { id: true } } },
    });
    expect(
      members.flatMap((member) => member.brands).map((brand) => brand.id),
    ).toEqual(['brand-a']);
  });
  it('treats missing, foreign, deleted and unassigned brands identically and validates in the transaction', async () => {
    for (const id of ['missing', 'foreign-brand', 'deleted-brand', 'brand-b']) {
      await expect(
        prisma.$transaction((tx) => policy.assert(actorA, id, tx)),
      ).rejects.toThrow('Brand access denied');
    }
    await expect(
      prisma.$transaction((tx) => policy.assert(actorA, 'brand-a', tx)),
    ).resolves.toBeUndefined();
  });
  it('revokes empty assignments immediately despite the persisted current-brand preference', async () => {
    await pool.query(
      `DELETE FROM "${schema}"."_member_brands" WHERE "B"='member-a'`,
    );
    expect(
      await prisma.brand.count({ where: await policy.predicate(actorA) }),
    ).toBe(0);
    await expect(policy.assert(actorA, 'brand-a')).rejects.toThrow(
      'Brand access denied',
    );
    expect(
      (
        await prisma.member.findFirst({
          where: { id: 'member-a', organizationId: 'org-a', isDeleted: false },
          select: { currentBrandId: true },
        })
      )?.currentBrandId,
    ).toBe('brand-a');
  });
  it('uses fresh role joins and caps an owner key before admin privilege', async () => {
    await pool.query(
      `UPDATE "${schema}".members SET "roleId"='owner' WHERE id='member-a'`,
    );
    expect(
      await prisma.brand.count({
        where: await policy.predicate({
          ...actorA,
          isApiKey: true,
          apiKeyId: 'key-a',
          scopes: ['*'],
        }),
      }),
    ).toBe(1);
    expect(
      await prisma.brand.count({
        where: await policy.predicate({
          ...actorA,
          isApiKey: true,
          apiKeyId: 'key-a',
          scopes: ['admin'],
        }),
      }),
    ).toBe(2);
    await pool.query(
      `UPDATE "${schema}".members SET "isActive"=false WHERE id='member-a'`,
    );
    await expect(policy.predicate(actorA)).rejects.toThrow(
      'Brand access denied',
    );
    await expect(
      policy.predicate({
        userId: 'deleted-user',
        organizationId: 'deleted-org',
      }),
    ).rejects.toThrow('Brand access denied');
  });
  it('refreshes key scopes, expiry and revocation against real PostgreSQL', async () => {
    await pool.query(
      `UPDATE "${schema}".members SET "roleId"='owner' WHERE id='member-a'`,
    );
    const keyActor = {
      ...actorA,
      isApiKey: true,
      apiKeyId: 'key-a',
      scopes: ['admin'],
    };
    expect(
      await prisma.brand.count({ where: await policy.predicate(keyActor) }),
    ).toBe(2);
    await pool.query(
      `UPDATE "${schema}".api_keys SET scopes=ARRAY['read'] WHERE id='key-a'`,
    );
    expect(
      await prisma.brand.count({ where: await policy.predicate(keyActor) }),
    ).toBe(1);
    await pool.query(
      `UPDATE "${schema}".api_keys SET "expiresAt"=$1::timestamp WHERE id='key-a'`,
      [new Date(Date.now() - 60_000).toISOString()],
    );
    await expect(policy.predicate(keyActor)).rejects.toThrow(
      'Brand access denied',
    );
    await pool.query(
      `UPDATE "${schema}".api_keys SET "expiresAt"=null,"isRevoked"=true WHERE id='key-a'`,
    );
    await expect(
      prisma.$transaction((tx) => policy.assert(keyActor, 'brand-a', tx)),
    ).rejects.toThrow('Brand access denied');
  });
  it('applies the same policy to real Knowledge mutations, versions, reads and async admission before embedding', async () => {
    const source = await records.createSource(actorA, {
      title: 'Visible source',
      scope: KnowledgeMemoryScope.BRAND,
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
    });
    const version = await records.createVersion(actorA, source.id, {
      observedAt: new Date().toISOString(),
      contentHash: `sha256:${randomUUID()}`,
      payload: { text: 'Fixture text' },
      provenance: { initiatingActor: { userId: 'forged-admin' } },
    });
    await expect(records.getSource(actorB, source.id)).rejects.toThrow();
    await expect(
      records.createSource(
        { ...actorB, brandId: 'brand-a' },
        {
          title: 'Denied',
          scope: KnowledgeMemoryScope.BRAND,
          kind: KnowledgeSourceKind.TEXT,
          purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
        },
      ),
    ).rejects.toThrow('Brand access denied');
    const request = {
      organizationId: actorA.organizationId,
      sourceId: source.id,
      versionId: version.id,
      initiatingActor: toKnowledgeWorkflowActor(actorA),
    };
    const state = await ingest.loadSource(request);
    expect(state.status).toBe('ready');
    await pool.query(
      `DELETE FROM "${schema}"."_member_brands" WHERE "B"='member-a'`,
    );
    await expect(records.listSources(actorA)).rejects.toThrow(
      'Brand access denied',
    );
    await expect(ingest.extractSource(state)).rejects.toThrow(
      'Knowledge access denied',
    );
    await expect(
      ingest.replaceChunks({
        ...state,
        extracted: { text: 'Fixture text' },
        chunks: ['Fixture text'],
      }),
    ).rejects.toThrow('Knowledge access denied');
    expect(embeddings).not.toHaveBeenCalled();
    await expect(
      ingest.loadSource({ ...request, initiatingActor: undefined }),
    ).rejects.toThrow('Knowledge access denied');
  });
  it('restricts admin backfill discovery to org, allowed brands and the requesting admin personal rows', async () => {
    for (const actor of [admin, { ...admin, userId: 'admin-b' }])
      await records
        .createSource(actor, {
          title: actor.userId,
          scope: KnowledgeMemoryScope.PERSONAL,
          kind: KnowledgeSourceKind.TEXT,
          purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
        })
        .then((source) =>
          records.createVersion(actor, source.id, {
            observedAt: new Date().toISOString(),
            provenance: {},
            contentHash: `sha256:${randomUUID()}`,
            payload: { text: 'Personal fixture' },
          }),
        );
    const scan = await ingest.scanForBackfill({
      organizationId: 'org-a',
      initiatingActor: toKnowledgeWorkflowActor(admin),
    });
    const sources = await prisma.knowledgeSource.findMany({
      where: {
        organizationId: 'org-a',
        isDeleted: false,
        scope: KnowledgeMemoryScope.PERSONAL,
      },
      select: { id: true, userId: true },
    });
    expect(
      scan.queued.some(
        (item) =>
          item.sourceId ===
          sources.find((source) => source.userId === 'admin-b')?.id,
      ),
    ).toBe(false);
    expect(
      scan.queued.some(
        (item) =>
          item.sourceId ===
          sources.find((source) => source.userId === 'admin-a')?.id,
      ),
    ).toBe(true);
    await expect(
      ingest.scanForBackfill({
        organizationId: 'org-a',
        initiatingActor: toKnowledgeWorkflowActor(actorA),
      }),
    ).rejects.toThrow();
  });
});
