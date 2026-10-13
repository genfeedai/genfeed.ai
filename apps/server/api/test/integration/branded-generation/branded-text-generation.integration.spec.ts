import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import { hashBrandGenerationRulesReviewV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import type { BrandedTextGenerationRequestV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  BrandedGenerationInputV1,
  BrandGenerationRulesV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { buildGenfeedDefaultKitDraft } from '@genfeedai/helpers';
import {
  BrandOsRevisionStatus,
  PrismaClient,
  toPrismaJson,
} from '@genfeedai/prisma';
import { createMediaUrlExtension } from '@libs/prisma/media-url.extension';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertIsolatedDatabaseUrl } from '../../../scripts/assert-isolated-db-url';

const emptyGenerationRules: BrandGenerationRulesV1 = {
  schemaVersion: 1,
  evidence: [],
  facts: [],
  palette: [],
  typography: [],
  mandatory: [],
  avoid: [],
  examples: [],
  assets: [],
};
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

// Real PostgreSQL in an owned schema, real receipt/snapshot/validation/harness
// services, fake provider (#5786). Not a pinned runtime-acceptance source.
describe('Branded text generation seam (real Postgres)', () => {
  const schema = `branded_text_${randomUUID().replaceAll('-', '')}`;
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;
  let sql: Client;
  let prisma: PrismaClient;
  let receipts: BrandedGenerationReceiptsService;

  beforeAll(async () => {
    process.env.TOKEN_ENCRYPTION_KEY =
      'branded-text-isolated-integration-test-only';
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
  });

  async function seed() {
    const [owner, member, source, destination, brand, fallback, foreignBrand] =
      Array.from({ length: 7 }, () => randomUUID());
    const ownerRole = await prisma.role.upsert({
      where: { key: 'owner' },
      create: { key: 'owner', label: 'Owner' },
      update: {},
    });
    const memberRole = await prisma.role.upsert({
      where: { key: 'user' },
      create: { key: 'user', label: 'User' },
      update: {},
    });
    await prisma.user.createMany({
      data: [owner, member].map((id) => ({ id, handle: `seam-${id}` })),
    });
    await prisma.organization.createMany({
      data: [source, destination].map((id) => ({
        id,
        label: id,
        slug: id,
        userId: owner,
      })),
    });
    await prisma.brand.createMany({
      data: [brand, fallback, foreignBrand].map((id) => ({
        id,
        label: id,
        slug: id,
        userId: owner,
        organizationId: id === foreignBrand ? destination : source,
      })),
    });
    for (const organizationId of [source, destination])
      await prisma.member.create({
        data: {
          userId: owner,
          organizationId,
          roleId: ownerRole.id,
          currentBrandId: organizationId === source ? brand : foreignBrand,
        },
      });
    await prisma.member.create({
      data: {
        userId: member,
        organizationId: source,
        roleId: memberRole.id,
        currentBrandId: brand,
        brands: { connect: { id: brand } },
      },
    });
    await prisma.brandOsRevision.create({
      data: {
        id: randomUUID(),
        organizationId: source,
        brandId: brand,
        version: 1,
        status: BrandOsRevisionStatus.APPROVED,
        content: toPrismaJson({
          brandId: brand,
          organizationId: source,
          fields: { label: { currentValue: 'Seam brand' } },
          generationRules: emptyGenerationRules,
        }),
        generationRulesReviewHash:
          hashBrandGenerationRulesReviewV1(emptyGenerationRules),
        approvedById: owner,
        approvedAt: new Date(),
      },
    });
    return {
      owner,
      member,
      source,
      destination,
      brand,
      fallback,
      foreignBrand,
    };
  }

  function buildSeam() {
    const providerIds: string[] = [];
    const openRouter = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        const id = `seam-generation-${randomUUID()}`;
        providerIds.push(id);
        return {
          id,
          choices: [{ message: { content: ' Seam post text ' } }],
        };
      }),
    };
    const access = new BrandedGenerationReceiptAccessService(
      new BrandAccessService(prisma as unknown as PrismaService),
    );
    const db = prisma as unknown as PrismaService;
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
    return { seam, openRouter, providerIds };
  }

  it('drives an approved-brand text generation through the saved receipt with a fake provider', async () => {
    const s = await seed();
    const { seam, openRouter, providerIds } = buildSeam();
    const actor = {
      actorId: s.owner,
      organizationId: s.source,
      brandId: s.brand,
    };
    const seamInput = (
      override: Partial<BrandedGenerationInputV1> = {},
    ): BrandedGenerationInputV1 => ({
      schemaVersion: 1,
      ...actor,
      requestKey: randomUUID(),
      candidateIndex: 0,
      surface: 'api',
      contentType: 'post',
      format: 'text',
      mode: 'approved_brand',
      originalPrompt: 'Write one post about the launch',
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      generationParameters: { maxTokens: 500, temperature: 0.8 },
      platform: 'twitter',
      objective: 'engagement',
      knowledgeSourceIds: [],
      knowledgeSpaceIds: [],
      ...override,
    });
    const request = (
      value: BrandedGenerationInputV1,
      postOrganizationId = value.organizationId,
      postBrandId = value.brandId,
    ): BrandedTextGenerationRequestV1 => ({
      input: value,
      initiatingActor: {
        userId: value.actorId,
        organizationId: value.organizationId,
      },
      privateLearning: baselinePrivateLearning,
      resolveApiKey: async () => undefined,
      acceptText: () => true,
      persistText: async (text) => {
        const post = await prisma.post.create({
          data: {
            id: randomUUID(),
            userId: s.owner,
            organizationId: postOrganizationId,
            brandId: postBrandId,
            description: text,
          },
        });
        return { postId: post.id };
      },
    });

    const value = seamInput();
    const completed = await seam.generate(request(value));
    if (completed.kind !== 'completed') {
      throw new Error(
        `Branded text generation stopped: ${'reasonCode' in completed ? completed.reasonCode : completed.kind}`,
      );
    }
    expect(completed.kind).toBe('completed');
    expect(completed).toMatchObject({
      text: 'Seam post text',
      hasNewDispatch: true,
    });
    expect(['ready', 'needs_review']).toContain(completed.receipt.state);
    expect(completed.receipt.compliance).not.toBe('compliant');
    expect(completed.receipt.snapshot?.approval).toBe('approved');
    expect(completed.receipt.execution?.providerAttemptRef).toBe(
      `openrouter:${providerIds[0]}`,
    );
    expect(completed.receipt.artifact?.id).toBe(completed.postId);
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(1);
    const sent = openRouter.chatCompletion.mock.calls[0][0].messages;
    expect(sent).toHaveLength(1);
    expect(sent[0].role).toBe('user');
    expect(sent[0].content).toContain('Write one post about the launch');
    expect(
      await receipts.readPrompt(actor, completed.receipt.id, 'compiled'),
    ).toMatchObject({ status: 'retained', text: sent[0].content });
    const events = await prisma.brandedGenerationReceiptEvent.findMany({
      where: {
        receiptId: completed.receipt.id,
        organizationId: s.source,
        brandId: s.brand,
        isDeleted: false,
      },
      orderBy: { revision: 'asc' },
    });
    expect(events.map((event) => event.type)).toEqual([
      'create',
      'resolve',
      'dispatch',
      'bind_artifact',
      'validate',
    ]);

    // The same request key replays the original without another provider call.
    const replay = await seam.generate(request(value));
    expect(replay).toMatchObject({
      kind: 'completed',
      postId: completed.postId,
      text: null,
      hasNewDispatch: false,
    });
    expect(replay.receipt.id).toBe(completed.receipt.id);
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(1);

    // Another actor reusing the key is rejected before any provider call.
    await expect(
      seam.generate(request(seamInput({ ...value, actorId: s.member }))),
    ).rejects.toThrow('request_payload_conflict');
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(1);

    // A brand without an approved revision blocks and never dispatches.
    const blocked = await seam.generate(
      request(seamInput({ brandId: s.fallback, requestKey: randomUUID() })),
    );
    expect(blocked).toMatchObject({
      kind: 'stopped',
      reasonCode: 'no_approved_revision',
      hasNewDispatch: false,
    });
    expect(blocked.receipt.state).toBe('blocked');
    expect(blocked.receipt.execution).toBeNull();
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(1);

    // A post saved in another organization cannot be bound to the receipt.
    const foreign = await seam.generate(
      request(
        seamInput({ requestKey: randomUUID() }),
        s.destination,
        s.foreignBrand,
      ),
    );
    expect(foreign).toMatchObject({
      kind: 'stopped',
      reasonCode: 'artifact_bind_failed',
      hasNewDispatch: true,
    });
    expect(foreign.receipt.state).toBe('failed');
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(2);
  }, 120000);

  it('generates provisionally from the Genfeed default kit and never reaches ready', async () => {
    const s = await seed();
    const { seam, openRouter } = buildSeam();
    const draftId = randomUUID();
    await prisma.brandOsRevision.create({
      data: {
        id: draftId,
        organizationId: s.source,
        brandId: s.fallback,
        version: 1,
        status: BrandOsRevisionStatus.DRAFT,
        content: toPrismaJson({
          ...buildGenfeedDefaultKitDraft({
            id: s.fallback,
            label: 'Fallback brand',
            organization: s.source,
          }),
          brandId: s.fallback,
          organizationId: s.source,
        }),
      },
    });
    const value: BrandedGenerationInputV1 = {
      schemaVersion: 1,
      actorId: s.owner,
      organizationId: s.source,
      brandId: s.fallback,
      requestKey: randomUUID(),
      candidateIndex: 0,
      surface: 'onboarding',
      contentType: 'post',
      format: 'text',
      mode: 'provisional_brand',
      draftRevisionId: draftId,
      originalPrompt: 'Introduce the brand in one post',
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      generationParameters: { maxTokens: 500, temperature: 0.8 },
      platform: 'twitter',
      objective: 'engagement',
      knowledgeSourceIds: [],
      knowledgeSpaceIds: [],
    };
    const request = (input: BrandedGenerationInputV1) => ({
      input,
      initiatingActor: {
        userId: input.actorId,
        organizationId: input.organizationId,
      },
      privateLearning: baselinePrivateLearning,
      resolveApiKey: async () => undefined,
      acceptText: () => true,
      persistText: async (text: string) => {
        const post = await prisma.post.create({
          data: {
            id: randomUUID(),
            userId: s.owner,
            organizationId: input.organizationId,
            brandId: input.brandId,
            description: text,
          },
        });
        return { postId: post.id };
      },
    });

    const completed = await seam.generate(request(value));
    if (completed.kind !== 'completed')
      throw new Error(`Provisional generation stopped: ${completed.kind}`);
    expect(completed.receipt.snapshot).toMatchObject({
      approval: 'provisional',
      revisionId: draftId,
    });
    expect(completed.receipt.state).toBe('needs_review');
    expect(completed.receipt.compliance).toBe('unverified');
    expect(completed.receipt.artifact?.id).toBe(completed.postId);
    const sent = openRouter.chatCompletion.mock.calls[0][0].messages;
    expect(sent[0].content).toContain('provisional');
    expect(sent[0].content).not.toContain('## Approved Brand Voice');

    // Replay returns the saved post without another provider call.
    const replay = await seam.generate(request(value));
    expect(replay).toMatchObject({ hasNewDispatch: false, kind: 'completed' });
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(1);

    // A draft that belongs to another brand blocks before dispatch.
    const blocked = await seam.generate(
      request({
        ...value,
        brandId: s.brand,
        draftRevisionId: draftId,
        requestKey: randomUUID(),
      }),
    );
    expect(blocked).toMatchObject({
      hasNewDispatch: false,
      kind: 'stopped',
      reasonCode: 'no_draft_revision',
    });
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(1);
  }, 120000);

  it('blocks a receipt stuck in resolved past the dispatch window without a member session', async () => {
    const s = await seed();
    const { seam, openRouter } = buildSeam();
    const requestKey = randomUUID();
    const value: BrandedGenerationInputV1 = {
      schemaVersion: 1,
      actorId: s.owner,
      organizationId: s.source,
      brandId: s.brand,
      requestKey,
      candidateIndex: 0,
      surface: 'api',
      contentType: 'post',
      format: 'text',
      mode: 'approved_brand',
      originalPrompt: 'Write one post about the launch',
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      generationParameters: { maxTokens: 500, temperature: 0.8 },
      platform: 'twitter',
      objective: 'engagement',
      knowledgeSourceIds: [],
      knowledgeSpaceIds: [],
    };
    const request = (): BrandedTextGenerationRequestV1 => ({
      input: value,
      initiatingActor: { userId: s.owner, organizationId: s.source },
      privateLearning: baselinePrivateLearning,
      resolveApiKey: async () => undefined,
      acceptText: () => true,
      persistText: async (text) => {
        const post = await prisma.post.create({
          data: {
            id: randomUUID(),
            userId: s.owner,
            organizationId: s.source,
            brandId: s.brand,
            description: text,
          },
        });
        return { postId: post.id };
      },
    });

    // A credit hold that never lands leaves the receipt resolved, with no dispatch.
    await expect(
      seam.generate({
        ...request(),
        admitDispatch: async () => {
          throw new Error('hold rejected');
        },
      }),
    ).rejects.toThrow('hold rejected');
    expect(openRouter.chatCompletion).not.toHaveBeenCalled();
    const stuck = await prisma.brandedGenerationReceipt.findFirstOrThrow({
      where: { organizationId: s.source, brandId: s.brand, requestKey },
    });
    expect(stuck.state).toBe('resolved');

    // Inside the window nothing is recovered.
    await expect(
      receipts.recoverExpiredDispatchesSystem({ limit: 10 }),
    ).resolves.toEqual({ blocked: [], skipped: [] });

    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    await sql.query(
      `UPDATE branded_generation_receipts SET "updatedAt" = ($2::timestamptz AT TIME ZONE 'UTC'), projection = jsonb_set(projection::jsonb, '{updatedAt}', to_jsonb($3::text)) WHERE id = $1`,
      [stuck.id, longAgo.toISOString(), longAgo.toISOString()],
    );
    const swept = await receipts.recoverExpiredDispatchesSystem({ limit: 10 });
    expect(swept).toEqual({ blocked: [stuck.id], skipped: [] });
    const blocked = await prisma.brandedGenerationReceipt.findFirstOrThrow({
      where: { id: stuck.id },
    });
    expect(blocked.state).toBe('blocked');

    // The sweep is idempotent and the same request key now answers stopped.
    await expect(
      receipts.recoverExpiredDispatchesSystem({ limit: 10 }),
    ).resolves.toEqual({ blocked: [], skipped: [] });
    const replay = await seam.generate(request());
    expect(replay).toMatchObject({
      hasNewDispatch: false,
      kind: 'stopped',
      reasonCode: 'dispatch_window_expired',
    });
    expect(openRouter.chatCompletion).not.toHaveBeenCalled();
  }, 120000);
});
