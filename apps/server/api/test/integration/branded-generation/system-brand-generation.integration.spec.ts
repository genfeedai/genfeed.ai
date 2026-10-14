import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { SystemBrandService } from '@api/collections/brands/services/system-brand.service';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import { BrandedModeResolverService } from '@api/services/branded-text-generation/branded-mode-resolver.service';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import type { BrandedTextGenerationRequestV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { BrandedGenerationInputV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { PrismaClient } from '@genfeedai/prisma';
import { createMediaUrlExtension } from '@libs/prisma/media-url.extension';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertIsolatedDatabaseUrl } from '../../../scripts/assert-isolated-db-url';

const baselinePrivateLearning: BrandedTextGenerationRequestV1['privateLearning'] =
  {
    mode: 'no_destination',
    configVersion: 'v1',
    synthetic: false,
    application: {
      status: 'unavailable',
      reasonCodes: ['no_destination'],
      privatePolicyApplied: false,
      sharedReleaseApplied: false,
      revalidatedAt: '2026-10-07T00:00:00.000Z',
    },
  };

// Real PostgreSQL in an owned schema, real receipt/snapshot/validation/harness/
// brand-revision services, fake provider (#5786). Not a pinned runtime-acceptance source.
describe.each([true, false])(
  'Genfeed system brand through the branded seam (real Postgres, cloud: %s)',
  (isCloud) => {
    const schema = `system_brand_${randomUUID().replaceAll('-', '')}`;
    const originalKey = process.env.TOKEN_ENCRYPTION_KEY;
    const originalCloud = process.env.GENFEED_CLOUD;
    let sql: Client;
    let prisma: PrismaClient;
    let receipts: BrandedGenerationReceiptsService;

    beforeAll(async () => {
      process.env.TOKEN_ENCRYPTION_KEY =
        'system-brand-isolated-integration-test-only';
      process.env.GENFEED_CLOUD = String(isCloud);
      const connectionString = assertIsolatedDatabaseUrl();
      sql = new Client({ connectionString });
      await sql.connect();
      await sql.query(`CREATE SCHEMA "${schema}"`);
      await sql.query(`SET search_path TO "${schema}", public`);
      const ddl = execFileSync(
        'bunx',
        [
          'prisma',
          'migrate',
          'diff',
          '--from-empty',
          '--to-schema',
          resolve('../../../packages/prisma/prisma/schema.prisma'),
          '--script',
        ],
        {
          cwd: resolve('../../../packages/prisma'),
          encoding: 'utf8',
          timeout: 60000,
        },
      );
      await sql.query(
        ddl
          .replaceAll('"public".', '')
          .replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, ''),
      );
      const scoped = new URL(connectionString);
      scoped.searchParams.set('options', `-c search_path=${schema},public`);
      prisma = new PrismaClient({
        adapter: new PrismaPg(
          { connectionString: scoped.toString() },
          { schema },
        ),
      }).$extends(
        createMediaUrlExtension({ cdnUrl: 'https://cdn.example.test' }),
      ) as unknown as PrismaClient;
      const access = new BrandedGenerationReceiptAccessService(
        new BrandAccessService(prisma as unknown as PrismaService),
      );
      receipts = new BrandedGenerationReceiptsService(
        prisma as unknown as PrismaService,
        access,
        new BrandedGenerationPromptStoreService(access),
      );
    }, 180000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await sql?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql?.end();
      if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
      else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
      if (originalCloud === undefined) delete process.env.GENFEED_CLOUD;
      else process.env.GENFEED_CLOUD = originalCloud;
    });

    /** The system principal and organization the production migration creates, plus a customer tenant. */
    async function seed() {
      const [customerUser, customerOrg, customerBrand] = Array.from(
        { length: 3 },
        () => randomUUID(),
      );
      const ownerRole = await prisma.role.upsert({
        where: { key: 'owner' },
        create: { key: 'owner', label: 'Owner' },
        update: {},
      });
      await prisma.user.createMany({
        data: [
          {
            id: SYSTEM_WORKFLOW_PRINCIPAL_ID,
            handle: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          },
          { id: customerUser, handle: `customer-${customerUser}` },
        ],
        skipDuplicates: true,
      });
      await prisma.organization.createMany({
        data: [
          {
            id: SYSTEM_WORKFLOW_PRINCIPAL_ID,
            label: SYSTEM_WORKFLOW_PRINCIPAL_ID,
            slug: SYSTEM_WORKFLOW_PRINCIPAL_ID,
            userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          },
          {
            id: customerOrg,
            label: customerOrg,
            slug: customerOrg,
            userId: customerUser,
          },
        ],
        skipDuplicates: true,
      });
      await prisma.brand.create({
        data: {
          id: customerBrand,
          label: customerBrand,
          organizationId: customerOrg,
          slug: customerBrand,
          userId: customerUser,
        },
      });
      await prisma.member.create({
        data: {
          currentBrandId: customerBrand,
          organizationId: customerOrg,
          roleId: ownerRole.id,
          userId: customerUser,
        },
      });
      return { customerBrand, customerOrg, customerUser };
    }

    function build() {
      const db = prisma as unknown as PrismaService;
      const access = new BrandedGenerationReceiptAccessService(
        new BrandAccessService(db),
      );
      const revisions = new BrandOsRevisionsService(db, {} as never);
      const resolver = new BrandedModeResolverService(
        revisions,
        new BrandAccessService(db),
        new SystemBrandService(db, revisions),
      );
      const hooks: { beforeAnswer?: () => Promise<void> } = {};
      const openRouter = {
        chatCompletion: vi.fn().mockImplementation(async () => {
          await hooks.beforeAnswer?.();
          return {
            id: `system-generation-${randomUUID()}`,
            choices: [{ message: { content: ' Genfeed system copy ' } }],
          };
        }),
      };
      const material = () =>
        new BrandedGenerationArtifactMaterialService(db, access, receipts);
      const seam = new BrandedTextGenerationService(
        receipts,
        new BrandIdentitySnapshotService(db, access, receipts),
        material(),
        new BrandValidationService(),
        new BrandValidationReceiptService(
          material(),
          receipts,
          new BrandValidationService(),
        ),
        new HarnessGenerationService(
          { composeBriefLayers: vi.fn().mockResolvedValue([]) } as never,
          {
            log: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          } as never,
          new BrandAccessService(db),
        ),
        {
          resolveActiveSkills: vi.fn().mockResolvedValue([]),
          buildSkillPromptSections: vi.fn().mockReturnValue(''),
        } as never,
        openRouter as never,
        new BrandAccessService(db),
      );
      return { hooks, openRouter, resolver, revisions, seam };
    }

    async function systemRequest(
      h: ReturnType<typeof build>,
      requestKey = randomUUID(),
    ) {
      const target = await h.resolver.resolveSystem();
      const input: BrandedGenerationInputV1 = {
        schemaVersion: 1,
        actorId: target.actor.userId,
        organizationId: target.actor.organizationId,
        brandId: target.brandId,
        requestKey,
        candidateIndex: 0,
        surface: 'api',
        contentType: 'post',
        format: 'text',
        mode: target.mode,
        ...(target.mode === 'provisional_brand'
          ? { draftRevisionId: target.draftRevisionId }
          : {}),
        originalPrompt: 'Write one post announcing a Genfeed release',
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        generationParameters: { maxTokens: 500, temperature: 0.8 },
        platform: 'twitter',
        objective: 'engagement',
        knowledgeSourceIds: [],
        knowledgeSpaceIds: [],
      };
      const request: BrandedTextGenerationRequestV1 = {
        input,
        initiatingActor: target.actor,
        privateLearning: baselinePrivateLearning,
        resolveApiKey: async () => undefined,
        acceptText: () => true,
        persistText: async (text) => {
          const post = await prisma.post.create({
            data: {
              id: randomUUID(),
              userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
              organizationId: input.organizationId,
              brandId: input.brandId,
              description: text,
            },
          });
          return { postId: post.id };
        },
      };
      return { input, request, target };
    }

    it('creates the system brand once and generates provisionally under its id, never reaching ready', async () => {
      await seed();
      const h = build();

      const first = await systemRequest(h);
      const second = await h.resolver.resolveSystem();
      expect(second.brandId).toBe(first.target.brandId);
      expect(
        await prisma.brand.count({
          where: {
            id: first.target.brandId,
            isDeleted: false,
            organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          },
        }),
      ).toBe(1);
      expect(
        await prisma.brandOsRevision.findMany({
          where: {
            brandId: first.target.brandId,
            isDeleted: false,
            organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          },
        }),
      ).toMatchObject([{ status: 'DRAFT', version: 1 }]);
      expect(first.target.mode).toBe('provisional_brand');

      const completed = await h.seam.generate(first.request);
      if (completed.kind !== 'completed')
        throw new Error(
          `System generation stopped: ${'reasonCode' in completed ? completed.reasonCode : completed.kind}`,
        );
      expect(completed).toMatchObject({
        hasNewDispatch: true,
        text: 'Genfeed system copy',
      });
      expect(completed.receipt).toMatchObject({
        brandId: first.target.brandId,
        compliance: 'unverified',
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        state: 'needs_review',
      });
      expect(completed.receipt.snapshot).toMatchObject({
        approval: 'provisional',
        brandId: first.target.brandId,
      });
      expect(
        await prisma.post.findFirstOrThrow({
          where: {
            id: completed.postId,
            organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          },
        }),
      ).toMatchObject({ brandId: first.target.brandId });

      // The same request key replays the original without another provider call.
      const replay = await h.seam.generate(first.request);
      expect(replay).toMatchObject({
        hasNewDispatch: false,
        kind: 'completed',
        postId: completed.postId,
      });
      expect(h.openRouter.chatCompletion).toHaveBeenCalledTimes(1);
    }, 120000);

    it('refuses to approve the unedited default kit', async () => {
      await seed();
      const h = build();
      const { target } = await systemRequest(h);
      const draft = await h.revisions.get(
        SYSTEM_WORKFLOW_PRINCIPAL_ID,
        target.brandId,
        (target as { draftRevisionId: string }).draftRevisionId,
      );
      await expect(
        h.revisions.approve(
          SYSTEM_WORKFLOW_PRINCIPAL_ID,
          target.brandId,
          draft.id,
          SYSTEM_WORKFLOW_PRINCIPAL_ID,
          String(draft.updatedAt),
        ),
      ).rejects.toMatchObject({
        response: { code: 'brand_kit_default_requires_edit' },
      });
      expect((await h.resolver.resolveSystem()).mode).toBe('provisional_brand');
    }, 120000);

    it('gives the system principal no reach into a customer brand', async () => {
      const s = await seed();
      const h = build();
      const { request } = await systemRequest(h);
      const intruder: BrandedTextGenerationRequestV1 = {
        ...request,
        initiatingActor: {
          userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          organizationId: s.customerOrg,
        },
        input: {
          ...request.input,
          brandId: s.customerBrand,
          organizationId: s.customerOrg,
          requestKey: randomUUID(),
        },
      };
      await expect(h.seam.generate(intruder)).rejects.toThrow(/denied/);
      expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
    }, 120000);

    it('stops a paid dispatch visibly, blocked as dispatch_window_expired, when the window closes during the provider call', async () => {
      await seed();
      const h = build();
      const { request, input } = await systemRequest(h);
      const postsBefore = await prisma.post.count({
        where: { organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID },
      });
      h.hooks.beforeAnswer = async () => {
        const longAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        await sql.query(
          `UPDATE branded_generation_receipts SET "updatedAt" = ($2::timestamptz AT TIME ZONE 'UTC'), projection = jsonb_set(projection::jsonb, '{updatedAt}', to_jsonb($3::text)) WHERE "requestKey" = $1`,
          [input.requestKey, longAgo, longAgo],
        );
      };

      const outcome = await h.seam.generate(request);

      expect(outcome).toMatchObject({
        hasNewDispatch: true,
        kind: 'stopped',
        postId: null,
        reasonCode: 'dispatch_window_expired',
      });
      expect(outcome.receipt.state).toBe('blocked');
      expect(h.openRouter.chatCompletion).toHaveBeenCalledTimes(1);
      expect(
        await prisma.post.count({
          where: { organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID },
        }),
      ).toBe(postsBefore);

      // Replaying the key answers stopped from the receipt and never calls the provider again.
      h.hooks.beforeAnswer = undefined;
      await expect(h.seam.generate(request)).resolves.toMatchObject({
        hasNewDispatch: false,
        kind: 'stopped',
        reasonCode: 'dispatch_window_expired',
      });
      expect(h.openRouter.chatCompletion).toHaveBeenCalledTimes(1);
    }, 120000);
  },
);
