import { randomUUID } from 'node:crypto';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeContentRetrievalService } from '@api/collections/contexts/services/knowledge-content-retrieval.service';
import {
  type AcceptanceWorld,
  acceptanceDatabaseUrl,
  openAcceptanceDatabase,
  recordingLogger,
  seedAcceptanceWorld,
} from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { BrandFactCheckService } from '@api/services/brand-validation/brand-fact-check.service';
import type { BrandFactCheckOutcome } from '@api/services/brand-validation/brand-fact-check.types';
import {
  FACT_EXTRACTION_SCHEMA_NAME,
  FACT_JUDGMENT_SCHEMA_NAME,
  type FactExtraction,
  type FactJudgment,
} from '@api/services/brand-validation/brand-fact-check-prompt.util';
import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { CONTEXT_EMBEDDING_DIMENSION } from '@genfeedai/contracts/constants';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));
vi.setConfig({ testTimeout: 60_000 });

const connectionString = acceptanceDatabaseUrl();
const zeroHash = `sha256:${'0'.repeat(64)}`;
const DRAFT = 'Our CEO is Jane Doe.';
/** One fixed query vector, so every seeded passage is an exact semantic match. */
const VECTOR = `[${Array.from({ length: CONTEXT_EMBEDDING_DIMENSION }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
const vector = JSON.parse(VECTOR) as number[];

/**
 * The fact check's evidence path against real PostgreSQL (#6717): the brand-scoped,
 * tenant-scoped pgvector retrieval of authoritative Knowledge, with the model calls
 * faked. Only BRAND_TRUTH, current, active, undeleted passages of the actor's own
 * organization and brand (or organization-wide ones) may ever be evidence.
 */
describe.skipIf(!connectionString)(
  'brand fact check: Knowledge retrieval (PostgreSQL)',
  () => {
    const database = openAcceptanceDatabase(connectionString ?? '');
    const { db, prisma } = database;
    const { logger } = recordingLogger();
    afterAll(async () => {
      await database.close();
    });

    const brandAccess = new BrandAccessService(prisma);
    const contexts = new ContextsService(
      prisma,
      logger,
      {} as never,
      {} as never,
    );
    Object.assign(contexts, { generateEmbedding: async () => vector });
    const retrieval = new KnowledgeContentRetrievalService(
      prisma,
      contexts,
      brandAccess,
    );

    interface Seeded {
      contextBaseId: string;
      sourceId: string;
      versionId: string;
    }
    async function seedPassage(
      world: AcceptanceWorld,
      content: string,
      options: {
        brandId?: string;
        isDeleted?: boolean;
        purpose?: 'BRAND_TRUTH' | 'INSPIRATION';
        retrievalState?: 'ACTIVE' | 'STALE';
        scope?: 'brand' | 'org';
      } = {},
    ): Promise<Seeded> {
      const scope = options.scope ?? 'brand';
      const brandId =
        scope === 'org' ? null : (options.brandId ?? world.brandId);
      const id = randomUUID();
      const contextBase = await db.contextBase.create({
        data: {
          data: {
            knowledgeScope: scope,
            label: 'Knowledge',
            purpose: 'knowledge-base',
          },
          id: `ctx-${id}`,
          organizationId: world.organizationId,
          sourceBrandId: brandId,
        },
      });
      const source = await db.knowledgeSource.create({
        data: {
          brandId,
          id: `src-${id}`,
          isDeleted: options.isDeleted ?? false,
          kind: 'TEXT',
          organizationId: world.organizationId,
          purpose: options.purpose ?? 'BRAND_TRUTH',
          scope,
          title: `Source ${id}`,
          userId: world.owner.id,
        },
      });
      const version = await db.knowledgeSourceVersion.create({
        data: {
          contentHash: `hash-${id}`,
          id: `ver-${id}`,
          isCurrent: true,
          observedAt: new Date(),
          organizationId: world.organizationId,
          processingState: 'READY',
          provenance: { url: 'https://example.test/about' },
          retrievalState: options.retrievalState ?? 'ACTIVE',
          retentionState: 'RETAINED',
          sourceId: source.id,
          version: 1,
        },
      });
      const entry = await db.contextEntry.create({
        data: {
          contextBaseId: contextBase.id,
          data: { content, kind: 'knowledge', metadata: {} },
          id: `ent-${id}`,
          knowledgeSourceId: source.id,
          knowledgeSourceVersionId: version.id,
          organizationId: world.organizationId,
        },
      });
      await db.$executeRawUnsafe(
        'UPDATE "context_entries" SET "embedding" = $1::vector WHERE "id" = $2',
        VECTOR,
        entry.id,
      );
      return {
        contextBaseId: contextBase.id,
        sourceId: source.id,
        versionId: version.id,
      };
    }

    function snapshotOf(world: AcceptanceWorld): BrandIdentitySnapshotV1 {
      return {
        approval: 'approved',
        brandId: world.brandId,
        contentHash: zeroHash,
        diagnostics: [],
        generationRules: {
          assets: [],
          avoid: [],
          evidence: [],
          examples: [],
          facts: [],
          mandatory: [],
          palette: [],
          schemaVersion: 1,
          typography: [],
        },
        identity: { name: 'Example Co' },
        organizationId: world.organizationId,
        resolvedAt: '2026-10-01T00:00:00Z',
        revisionId: 'revision-a',
        revisionVersion: 1,
        schemaVersion: 1,
        voice: { audience: [], avoid: [], messagingPillars: [], values: [] },
      };
    }

    /** A judge that rules on the first claim using the evidence containing `needle`. */
    function checker(needle: string, verdict: 'supported' | 'contradicted') {
      const seen: string[] = [];
      const completeStructured = vi.fn(
        async (params: {
          messages: Array<{ content: unknown }>;
          schemaName: string;
        }): Promise<FactExtraction | FactJudgment> => {
          if (params.schemaName === FACT_EXTRACTION_SCHEMA_NAME)
            return {
              claims: [
                { claim: 'The CEO is Jane Doe', quote: 'Our CEO is Jane Doe' },
              ],
            };
          expect(params.schemaName).toBe(FACT_JUDGMENT_SCHEMA_NAME);
          const body = JSON.parse(String(params.messages[1].content)) as {
            evidence: Array<{ evidenceId: string; text: string }>;
          };
          seen.push(...body.evidence.map((e) => e.evidenceId));
          const match = body.evidence.find((e) => e.text.includes(needle));
          return {
            verdicts: match
              ? [
                  {
                    citations: [
                      { evidenceId: match.evidenceId, quote: needle },
                    ],
                    claimId: 'claim-1',
                    verdict,
                  },
                ]
              : [],
          };
        },
      );
      return {
        seen,
        service: new BrandFactCheckService(
          { completeStructured } as never,
          retrieval,
          logger,
        ),
      };
    }

    const actorOf = (
      world: AcceptanceWorld,
      userId = world.owner.id,
    ): BrandedGenerationActorV1 => ({
      actorId: userId,
      brandId: world.brandId,
      organizationId: world.organizationId,
    });
    const run = (
      service: BrandFactCheckService,
      world: AcceptanceWorld,
      actor = actorOf(world),
    ): Promise<BrandFactCheckOutcome> =>
      service.check(actor, {
        origin: 'text',
        snapshot: snapshotOf(world),
        text: DRAFT,
      });

    it('contradicts a claim with a brand Knowledge passage and binds the exact source version', async () => {
      const world = await seedAcceptanceWorld(db);
      const passage = await seedPassage(
        world,
        'Example Co is led by CEO John Smith.',
      );
      const { service } = checker('led by CEO John Smith', 'contradicted');
      const outcome = await run(service, world);
      expect(outcome).toMatchObject({
        knowledgeVersions: [
          {
            sourceId: passage.sourceId,
            version: 1,
            versionId: passage.versionId,
          },
        ],
        status: 'checked',
      });
      if (outcome.status !== 'checked') throw new Error('unreachable');
      expect(outcome.claims[0]).toMatchObject({
        evidence: [
          {
            origin: 'knowledge',
            sourceId: passage.sourceId,
            version: 1,
            versionId: passage.versionId,
          },
        ],
        verdict: 'contradicted',
      });
    });

    it('also uses organization-wide Knowledge, as brand generation does', async () => {
      const world = await seedAcceptanceWorld(db);
      const shared = await seedPassage(
        world,
        'The CEO of Example Co is Jane Doe.',
        {
          scope: 'org',
        },
      );
      const { service } = checker('CEO of Example Co is Jane Doe', 'supported');
      const outcome = await run(service, world);
      if (outcome.status !== 'checked') throw new Error('unreachable');
      expect(outcome.claims[0]).toMatchObject({ verdict: 'supported' });
      expect(outcome.knowledgeVersions).toEqual([
        { sourceId: shared.sourceId, version: 1, versionId: shared.versionId },
      ]);
    });

    it('never reads another organization, even for an identical passage', async () => {
      const world = await seedAcceptanceWorld(db);
      const other = await seedAcceptanceWorld(db);
      const foreign = await seedPassage(
        other,
        'The CEO is Jane Doe, said org B.',
      );
      const { service, seen } = checker('The CEO is Jane Doe', 'supported');
      const outcome = await run(service, world);
      if (outcome.status !== 'checked') throw new Error('unreachable');
      expect(outcome.claims[0]).toMatchObject({
        evidence: [],
        verdict: 'unverified',
      });
      expect(outcome.knowledgeVersions).toEqual([]);
      expect(seen.join()).not.toContain(foreign.sourceId);
    });

    it('refuses a snapshot or actor of another organization before reading anything', async () => {
      const world = await seedAcceptanceWorld(db);
      const other = await seedAcceptanceWorld(db);
      await seedPassage(other, 'The CEO is Jane Doe.');
      const { service, seen } = checker('The CEO is Jane Doe', 'supported');
      expect(
        await service.check(actorOf(other), {
          origin: 'text',
          snapshot: snapshotOf(world),
          text: DRAFT,
        }),
      ).toEqual({
        reasonCode: 'fact_check_scope_mismatch',
        status: 'unavailable',
      });
      expect(seen).toEqual([]);
    });

    it("never reads another brand's Knowledge in the same organization", async () => {
      const world = await seedAcceptanceWorld(db);
      const otherBrandId = `bk-brand-c-${world.suffix}`;
      await db.brand.create({
        data: {
          id: otherBrandId,
          label: otherBrandId,
          organizationId: world.organizationId,
          slug: otherBrandId,
          userId: world.owner.id,
        },
      });
      const own = await seedPassage(world, 'Example Co sells widgets.');
      const sibling = await seedPassage(
        world,
        'The CEO is Jane Doe, said brand C.',
        {
          brandId: otherBrandId,
        },
      );
      const { service, seen } = checker('The CEO is Jane Doe', 'supported');
      const outcome = await run(service, world);
      if (outcome.status !== 'checked') throw new Error('unreachable');
      expect(outcome.claims[0]).toMatchObject({ verdict: 'unverified' });
      expect(seen.join()).toContain(own.sourceId);
      expect(seen.join()).not.toContain(sibling.sourceId);
    });

    it('respects brand access: a member who cannot see the brand gets no evidence', async () => {
      const world = await seedAcceptanceWorld(db);
      await seedPassage(world, 'The CEO is Jane Doe.');
      const { service } = checker('The CEO is Jane Doe', 'supported');
      expect(
        await run(service, world, actorOf(world, world.outsider.id)),
      ).toEqual({
        reasonCode: 'fact_check_evidence_unavailable',
        status: 'unavailable',
      });
      expect(
        await run(service, world, actorOf(world, world.creator.id)),
      ).toMatchObject({ status: 'checked' });
    });

    it('ignores inspiration sources, stale versions and deleted sources', async () => {
      const world = await seedAcceptanceWorld(db);
      const own = await seedPassage(world, 'Example Co sells widgets.');
      const ineligible = [
        await seedPassage(world, 'The CEO is Jane Doe (inspiration).', {
          purpose: 'INSPIRATION',
        }),
        await seedPassage(world, 'The CEO is Jane Doe (stale).', {
          retrievalState: 'STALE',
        }),
        await seedPassage(world, 'The CEO is Jane Doe (deleted).', {
          isDeleted: true,
        }),
      ];
      const { service, seen } = checker('The CEO is Jane Doe', 'supported');
      const outcome = await run(service, world);
      if (outcome.status !== 'checked') throw new Error('unreachable');
      expect(outcome.claims[0]).toMatchObject({ verdict: 'unverified' });
      expect(seen.join()).toContain(own.sourceId);
      for (const passage of ineligible)
        expect(seen.join()).not.toContain(passage.sourceId);
    });
  },
);
