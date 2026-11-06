import { BrandRemixRunPaidDraftService } from '@api/collections/content-runs/services/brand-remix-run-paid-draft.service';
import { assembleBrandRemixRunsGraph } from '@api/collections/content-runs/services/brand-remix-runs.factory';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import {
  ContentRunStatus,
  IngredientStatus,
  PersistedReviewDecision,
} from '@genfeedai/contracts';
import { brandRemixRunConfigSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

const createdAt = new Date('2026-08-20T10:00:00.000Z');

interface CredentialRow {
  brandId: string;
  grantedScopes: string[];
  grantedScopesCapturedAt: Date | null;
  id: string;
  isConnected: boolean;
  isDeleted: boolean;
  organizationId: string;
  platform: string;
}

/** A where value matches when it equals the row's column. */
const matches = (row: object, where: Record<string, unknown>) =>
  Object.entries(where).every(
    ([key, value]) => (row as Record<string, unknown>)[key] === value,
  );

describe('BrandRemixRunPaidDraftService', () => {
  /** The stored run, the brand's ad credentials, and every provider draft request. */
  const state = {
    credentials: [] as CredentialRow[],
    providerDrafts: [] as { platform: 'meta' | 'x'; input: unknown }[],
    run: null as Record<string, unknown> | null,
  };
  const prisma = {
    contentRun: {
      findFirst: async () => state.run,
      // Another writer always commits first: the exact-config claim loses.
      updateMany: async () => ({ count: 0 }),
    },
    credential: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.credentials.find((row) => matches(row, where)) ?? null,
    },
    ingredient: {
      findMany: async () => [
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ],
    },
    post: {
      findMany: async () => [
        { id: 'post-1', reviewDecision: PersistedReviewDecision.APPROVED },
      ],
    },
  } as unknown as PrismaService;
  const pausedMetaCampaignDraftService = {
    prepare: async (input: unknown) => {
      state.providerDrafts.push({ input, platform: 'meta' });
      return {};
    },
  };
  const pausedXAdsCampaignDraftService = {
    prepare: async (input: unknown) => {
      state.providerDrafts.push({ input, platform: 'x' });
      return {};
    },
  };
  let paidDraft: BrandRemixRunPaidDraftService;

  beforeEach(() => {
    state.credentials = [];
    state.providerDrafts = [];
    state.run = null;
    const graph = assembleBrandRemixRunsGraph({
      adsResearchService: {} as never,
      avatarVideoGenerationService: {} as never,
      turboRunService: {} as never,
      brandsService: {
        findOne: async () => ({
          agentConfig: {},
          description: 'Operational content systems.',
          id: 'brand-1',
          isActive: true,
          label: 'Acme',
          organizationId: 'org-1',
          text: 'Turn content signals into campaigns.',
        }),
        resolveBrandKitAssets: async () => ({ references: [] }),
      } as never,
      byokService: {} as never,
      contentGeneratorService: {} as never,
      creditsUtilsService: {} as never,
      imageGenerationService: {} as never,
      personasService: personasServiceStub(),
      organizationSettingsService: {
        findOne: async () => ({ organizationId: 'org-1' }),
      } as never,
      pausedMetaCampaignDraftService: pausedMetaCampaignDraftService as never,
      pausedXAdsCampaignDraftService: pausedXAdsCampaignDraftService as never,
      prisma,
      runtime: {
        now: () => new Date('2026-08-20T10:00:00.000Z'),
        randomId: () => 'unused',
      },
      systemWorkflowRunner: {} as never,
      trendReferenceCorpusService: {} as never,
      videoGenerationService: {} as never,
    });
    paidDraft = graph.paidDraft;
  });

  function storeRun(platform: 'meta' | 'x') {
    state.run = {
      brandId: 'brand-1',
      config: approvedPaidConfig(platform),
      createdAt,
      id: 'run-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.COMPLETED,
      updatedAt: createdAt,
    };
  }

  const metaCredential = (
    overrides: Partial<CredentialRow> = {},
  ): CredentialRow => ({
    brandId: 'brand-1',
    grantedScopes: ['ads_management'],
    grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
    id: 'credential-1',
    isConnected: true,
    isDeleted: false,
    organizationId: 'org-1',
    platform: 'FACEBOOK',
    ...overrides,
  });

  function approvedPaidConfig(platform: 'meta' | 'x') {
    return brandRemixRunConfigSchema.parse({
      contract: 'brand-remix-run',
      draft: {
        fidelityMode: 'guided',
        identity: {},
        intent: { objective: 'Create an original brand execution.' },
        output: { aspectRatio: '1:1', count: 1, kind: 'image' },
        references: [],
        reviewRequired: true,
        target: { kind: 'paid', platform },
      },
      execution: {
        actualCount: 1,
        generationBrief: {
          constraints: [],
          fidelityMode: 'guided',
          intent: {
            objective: 'Create an original brand execution.',
            requestedText: [],
            subjects: ['Acme'],
          },
          mediaKind: 'image',
          output: { aspectRatio: '1:1' },
          provenance: [],
          references: [],
          version: 1,
        },
        requestedCount: 1,
        variants: [
          {
            assetIds: ['image-1'],
            id: 'variant-1',
            recipeRevision: 1,
            status: 'ready',
          },
        ],
      },
      phase: 'approved',
      readiness: { issues: [], state: 'ready' },
      recipeVersion: 1,
      revision: 1,
      review: {
        approvedPostIds: ['post-1'],
        turboRunId: 'batch-1',
        postIds: ['post-1'],
        workflowExecutionId: 'workflow-execution-1',
        workflowId: 'workflow-1',
      },
      sourceSnapshot: {
        capturedAt: '2026-08-20T10:00:00.000Z',
        canonicalUrl: 'https://meta.example/ad/1',
        destinationUrl: 'https://acme.example/offer',
        evidence: ['hook'],
        metrics: {},
        pattern: { hook: 'Outcome-led relevance hook.' },
        platform,
        selector: { adPerformanceId: 'ad-1', kind: 'public_ad' },
        sourceId: 'ad-1',
        title: 'hook',
      },
      version: 1,
    });
  }

  it('rejects an X Ads draft that is missing a source tweet before provider calls', async () => {
    storeRun('x');

    await expect(
      paidDraft.prepare('org-1', 'run-1', 'user-1', {
        destination: { adAccountId: 'act-1', credentialId: 'credential-1' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.providerDrafts).toEqual([]);
  });

  it('does not call Meta when the paid-draft claim loses its exact-config CAS', async () => {
    storeRun('meta');
    state.credentials = [metaCredential()];

    await expect(
      paidDraft.prepare('org-1', 'run-1', 'user-1', {
        destination: { adAccountId: 'act-1', credentialId: 'credential-1' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(state.providerDrafts).toEqual([]);
  });

  it.each([
    ['another brand', { brandId: 'brand-2' }],
    ['another organization', { organizationId: 'org-2' }],
    ['a removed credential', { isDeleted: true }],
    ['a disconnected credential', { isConnected: false }],
  ])(
    'refuses an ads credential from %s before any provider call',
    async (_label, overrides) => {
      storeRun('meta');
      state.credentials = [metaCredential(overrides)];

      await expect(
        paidDraft.prepare('org-1', 'run-1', 'user-1', {
          destination: { adAccountId: 'act-1', credentialId: 'credential-1' },
        }),
      ).rejects.toThrow('Ads credential is unavailable');
      expect(state.providerDrafts).toEqual([]);
    },
  );
});
