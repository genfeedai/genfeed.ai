import type { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import type { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import type { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { AUTOMATION_WORKFLOW_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import type { ExpertCorpusService } from '@api/services/expert-path/services/expert-corpus.service';
import { ExpertFirstSystemService } from '@api/services/expert-path/services/expert-first-system.service';
import { formatHarnessBrief } from '@api/services/harness/harness-brief.util';
import type { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentPlanItemStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const BRIEF = {
  evaluationCriteria: [],
  guardrails: [],
  metadata: { contentType: 'post', objective: 'engagement' },
  packs: [],
  providerHints: [],
  receipts: {
    harnessProfileId: 'profile-1',
  },
  sources: [],
  styleDirectives: ['Voice tone: Confident.'],
  systemDirectives: ['Big Domino — every piece ladders to this belief: X'],
};

function makeLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

describe('ExpertFirstSystemService', () => {
  let service: ExpertFirstSystemService;
  let credentialDelegate: { findMany: ReturnType<typeof vi.fn> };
  let brandDelegate: { findFirst: ReturnType<typeof vi.fn> };
  let brandMemoryService: {
    listTypedEntries: ReturnType<typeof vi.fn>;
    upsertTypedEntry: ReturnType<typeof vi.fn>;
  };
  let contentPlanItemsService: {
    getByIdOrFail: ReturnType<typeof vi.fn>;
    listByPlan: ReturnType<typeof vi.fn>;
    updateContent: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
  };
  let contentPlannerService: { generatePlan: ReturnType<typeof vi.fn> };
  let contentPlansService: {
    getByIdOrFail: ReturnType<typeof vi.fn>;
    recordProvenance: ReturnType<typeof vi.fn>;
  };
  let creditsUtilsService: {
    checkOrganizationCreditsAvailable: ReturnType<typeof vi.fn>;
    deductCreditsFromOrganization: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let expertCorpusService: { summarize: ReturnType<typeof vi.fn> };
  let harnessGenerationService: { resolveBrief: ReturnType<typeof vi.fn> };
  let harnessProfilesService: { getActiveForBrand: ReturnType<typeof vi.fn> };
  let systemWorkflowRunner: { runWorkflow: ReturnType<typeof vi.fn> };
  let moduleRef: ModuleRef;
  let logger: LoggerService;

  beforeEach(() => {
    credentialDelegate = { findMany: vi.fn().mockResolvedValue([]) };
    brandDelegate = {
      findFirst: vi.fn().mockResolvedValue({
        agentConfig: { strategy: { platforms: ['linkedin'] } },
      }),
    };
    brandMemoryService = {
      listTypedEntries: vi.fn().mockResolvedValue([]),
      upsertTypedEntry: vi.fn().mockResolvedValue({ id: 'memory-1' }),
    };
    contentPlanItemsService = {
      getByIdOrFail: vi.fn(),
      listByPlan: vi.fn().mockResolvedValue([]),
      updateContent: vi.fn(),
      updateStatus: vi.fn(),
    };
    contentPlannerService = {
      generatePlan: vi.fn().mockResolvedValue({
        items: [{ id: 'item-1' }],
        plan: { id: 'plan-1' },
      }),
    };
    contentPlansService = {
      getByIdOrFail: vi.fn(),
      recordProvenance: vi
        .fn()
        .mockImplementation((_orgId, planId, provenance) =>
          Promise.resolve({ id: planId, provenance }),
        ),
    };
    creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
    };
    expertCorpusService = {
      summarize: vi
        .fn()
        .mockResolvedValue({ readySourceIds: ['source-1'], sourceCount: 1 }),
    };
    harnessGenerationService = {
      resolveBrief: vi.fn().mockResolvedValue(BRIEF),
    };
    harnessProfilesService = {
      getActiveForBrand: vi.fn().mockResolvedValue({
        id: 'profile-1',
        label: 'Acme expert voice',
        positioning: { totalScore: 80 },
        thesis: { bigDomino: ['Process beats talent'] },
      }),
    };
    systemWorkflowRunner = { runWorkflow: vi.fn().mockResolvedValue({}) };
    moduleRef = {
      get: vi.fn((token: unknown) =>
        token === SystemWorkflowRunnerService
          ? systemWorkflowRunner
          : undefined,
      ),
    } as unknown as ModuleRef;
    logger = makeLogger();

    service = new ExpertFirstSystemService(
      {
        brand: brandDelegate,
        credential: credentialDelegate,
      } as unknown as PrismaService,
      brandMemoryService as unknown as BrandMemoryService,
      contentPlanItemsService as unknown as ContentPlanItemsService,
      contentPlannerService as unknown as ContentPlannerService,
      contentPlansService as unknown as ContentPlansService,
      creditsUtilsService as unknown as CreditsUtilsService,
      expertCorpusService as unknown as ExpertCorpusService,
      harnessGenerationService as unknown as HarnessGenerationService,
      harnessProfilesService as unknown as HarnessProfilesService,
      logger,
      moduleRef,
    );
  });

  describe('getReadiness', () => {
    it('reports missing positioning and corpus when neither is ready', async () => {
      harnessProfilesService.getActiveForBrand.mockResolvedValue(null);
      expertCorpusService.summarize.mockResolvedValue({
        readySourceIds: [],
        sourceCount: 0,
      });

      const readiness = await service.getReadiness('org-1', 'brand-1');

      expect(readiness.isReady).toBe(false);
      expect(readiness.missing).toEqual(['positioning', 'corpus']);
    });

    it('reports ready with no missing items when positioning and corpus are both present', async () => {
      const readiness = await service.getReadiness('org-1', 'brand-1');

      expect(readiness.isReady).toBe(true);
      expect(readiness.missing).toEqual([]);
      expect(readiness.creditCost).toBe(10);
    });

    it('uses connected credential platforms and marks isUsingInterviewPlatforms false', async () => {
      credentialDelegate.findMany.mockResolvedValue([
        { platform: 'LINKEDIN' },
        { platform: 'TIKTOK' },
        { platform: 'LINKEDIN' },
      ]);

      const readiness = await service.getReadiness('org-1', 'brand-1');

      expect(readiness.isUsingInterviewPlatforms).toBe(false);
      expect(readiness.platforms.sort()).toEqual(['linkedin', 'tiktok']);
      expect(credentialDelegate.findMany).toHaveBeenCalledWith({
        select: { platform: true },
        where: {
          brandId: 'brand-1',
          isConnected: true,
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('falls back to the interview platforms and marks isUsingInterviewPlatforms true when nothing is connected', async () => {
      credentialDelegate.findMany.mockResolvedValue([]);
      brandDelegate.findFirst.mockResolvedValue({
        agentConfig: { strategy: { platforms: ['youtube', 'instagram'] } },
      });

      const readiness = await service.getReadiness('org-1', 'brand-1');

      expect(readiness.isUsingInterviewPlatforms).toBe(true);
      expect(readiness.platforms).toEqual(['youtube', 'instagram']);
    });
  });

  describe('generate', () => {
    it('returns the existing plan without charging again after a timed-out success', async () => {
      brandMemoryService.listTypedEntries.mockResolvedValue([
        {
          content: 'generated',
          metadata: { planId: 'plan-1', status: 'generated' },
          type: 'expert-path.first-system',
        },
      ]);
      contentPlansService.getByIdOrFail.mockResolvedValue({
        id: 'plan-1',
        provenance: {
          connectToSchedulePlatforms: ['linkedin'],
          corpusSourceIds: ['source-1'],
          harnessProfileId: 'profile-1',
          knowledgeReceipts: [],
          source: 'expert-first-system',
        },
      });
      contentPlanItemsService.listByPlan.mockResolvedValue([{ id: 'item-1' }]);

      const result = await service.generate({
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(String(result.plan.id)).toBe('plan-1');
      expect(result.provenance.harnessProfileId).toBe('profile-1');
      expect(contentPlannerService.generatePlan).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
    });

    it('rejects with BadRequestException when the first system is not ready', async () => {
      harnessProfilesService.getActiveForBrand.mockResolvedValue(null);

      await expect(
        service.generate({
          brandId: 'brand-1',
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(contentPlannerService.generatePlan).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
    });

    it('rejects with InsufficientCreditsException without calling the planner when credits are unavailable', async () => {
      creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        false,
      );
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(2);

      await expect(
        service.generate({
          brandId: 'brand-1',
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(InsufficientCreditsException);

      expect(contentPlannerService.generatePlan).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
    });

    it('builds the brief with BRAND_TRUTH knowledge, plans 7 items, deducts credits after the plan exists, and records success', async () => {
      const result = await service.generate({
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(harnessGenerationService.resolveBrief).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          knowledgeSelection: { purposes: ['BRAND_TRUTH'] },
          organizationId: 'org-1',
        }),
      );

      expect(contentPlannerService.generatePlan).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'user-1',
        expect.objectContaining({
          itemCount: 7,
          platforms: ['linkedin'],
        }),
      );
      const plannerCall = contentPlannerService.generatePlan.mock.calls[0][3];
      expect(plannerCall.additionalInstructions).toContain(
        formatHarnessBrief(BRIEF as never),
      );

      expect(contentPlansService.recordProvenance).toHaveBeenCalledWith(
        'org-1',
        'plan-1',
        expect.objectContaining({
          // Nothing is connected in this fixture, so the plan is built for the
          // interview platforms and marked "connect to schedule".
          connectToSchedulePlatforms: ['linkedin'],
          corpusSourceIds: ['source-1'],
          harnessProfileId: 'profile-1',
          source: 'expert-first-system',
        }),
      );

      // Credits are deducted only once the plan exists.
      const deductOrder =
        creditsUtilsService.deductCreditsFromOrganization.mock
          .invocationCallOrder[0];
      const generatePlanOrder =
        contentPlannerService.generatePlan.mock.invocationCallOrder[0];
      expect(deductOrder).toBeGreaterThan(generatePlanOrder);
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        10,
        'Expert Path first content system',
        expect.any(String),
      );

      expect(brandMemoryService.upsertTypedEntry).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        expect.objectContaining({
          content: 'generated',
          metadata: expect.objectContaining({
            planId: 'plan-1',
            status: 'generated',
          }),
          type: 'expert-path.first-system',
        }),
      );

      expect(result.plan).toEqual({
        id: 'plan-1',
        provenance: expect.anything(),
      });
    });

    it('records connectToSchedulePlatforms only when using interview platforms', async () => {
      credentialDelegate.findMany.mockResolvedValue([]);
      brandDelegate.findFirst.mockResolvedValue({
        agentConfig: { strategy: { platforms: ['youtube'] } },
      });

      await service.generate({
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(contentPlansService.recordProvenance).toHaveBeenCalledWith(
        'org-1',
        'plan-1',
        expect.objectContaining({
          connectToSchedulePlatforms: ['youtube'],
        }),
      );
    });

    it('writes a failed record with the error and does not deduct credits when plan building throws', async () => {
      contentPlannerService.generatePlan.mockRejectedValue(
        new Error('planner unavailable'),
      );

      await expect(
        service.generate({
          brandId: 'brand-1',
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      ).rejects.toThrow('planner unavailable');

      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
      expect(brandMemoryService.upsertTypedEntry).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        expect.objectContaining({
          content: 'failed',
          metadata: expect.objectContaining({
            error: 'planner unavailable',
            status: 'failed',
          }),
          type: 'expert-path.first-system',
        }),
      );
    });
  });

  describe('applyItemAction', () => {
    const baseParams = {
      action: 'approve' as const,
      brandId: 'brand-1',
      itemId: 'item-1',
      organizationId: 'org-1',
      planId: 'plan-1',
      userId: 'user-1',
    };

    function mockPlan(provenanceSource: string | undefined) {
      contentPlansService.getByIdOrFail.mockResolvedValue({
        id: 'plan-1',
        provenance: provenanceSource ? { source: provenanceSource } : {},
      });
    }

    it('rejects plans that were not generated by the Expert Path first system', async () => {
      mockPlan('some-other-source');

      await expect(service.applyItemAction(baseParams)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects items that belong to a different plan', async () => {
      mockPlan('expert-first-system');
      contentPlanItemsService.getByIdOrFail.mockResolvedValue({
        id: 'item-1',
        planId: 'plan-other',
        status: ContentPlanItemStatus.PENDING,
      });

      await expect(service.applyItemAction(baseParams)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects items that are not pending', async () => {
      mockPlan('expert-first-system');
      contentPlanItemsService.getByIdOrFail.mockResolvedValue({
        id: 'item-1',
        planId: 'plan-1',
        status: ContentPlanItemStatus.EXECUTING,
      });

      await expect(service.applyItemAction(baseParams)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an edit action without topic or prompt changes', async () => {
      mockPlan('expert-first-system');
      contentPlanItemsService.getByIdOrFail.mockResolvedValue({
        id: 'item-1',
        planId: 'plan-1',
        status: ContentPlanItemStatus.PENDING,
      });

      await expect(
        service.applyItemAction({ ...baseParams, action: 'edit' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(contentPlanItemsService.updateContent).not.toHaveBeenCalled();
    });

    it('edit calls updateContent with the provided topic/prompt', async () => {
      mockPlan('expert-first-system');
      contentPlanItemsService.getByIdOrFail.mockResolvedValue({
        id: 'item-1',
        planId: 'plan-1',
        status: ContentPlanItemStatus.PENDING,
      });
      contentPlanItemsService.updateContent.mockResolvedValue({
        id: 'item-1',
        prompt: 'New prompt',
        topic: 'New topic',
      });

      const result = await service.applyItemAction({
        ...baseParams,
        action: 'edit',
        prompt: 'New prompt',
        topic: 'New topic',
      });

      expect(contentPlanItemsService.updateContent).toHaveBeenCalledWith(
        'org-1',
        'item-1',
        { prompt: 'New prompt', topic: 'New topic' },
      );
      expect(result.item.topic).toBe('New topic');
      expect(systemWorkflowRunner.runWorkflow).not.toHaveBeenCalled();
    });

    it('reject sets the item status to SKIPPED', async () => {
      mockPlan('expert-first-system');
      contentPlanItemsService.getByIdOrFail.mockResolvedValue({
        id: 'item-1',
        planId: 'plan-1',
        status: ContentPlanItemStatus.PENDING,
      });
      contentPlanItemsService.updateStatus.mockResolvedValue({
        id: 'item-1',
        status: ContentPlanItemStatus.SKIPPED,
      });

      const result = await service.applyItemAction({
        ...baseParams,
        action: 'reject',
      });

      expect(contentPlanItemsService.updateStatus).toHaveBeenCalledWith(
        'org-1',
        'item-1',
        ContentPlanItemStatus.SKIPPED,
      );
      expect(result.item.status).toBe(ContentPlanItemStatus.SKIPPED);
    });

    it('approve runs the CONTENT_ENGINE_ITEM system workflow via the lazily-resolved runner', async () => {
      mockPlan('expert-first-system');
      contentPlanItemsService.getByIdOrFail
        .mockResolvedValueOnce({
          id: 'item-1',
          planId: 'plan-1',
          status: ContentPlanItemStatus.PENDING,
        })
        .mockResolvedValueOnce({
          id: 'item-1',
          planId: 'plan-1',
          status: ContentPlanItemStatus.EXECUTING,
        });

      const result = await service.applyItemAction(baseParams);

      expect(moduleRef.get).toHaveBeenCalledWith(SystemWorkflowRunnerService, {
        strict: false,
      });
      expect(systemWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_ITEM,
          canonicalId: AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE_ITEM,
          inputValues: expect.objectContaining({
            brandId: 'brand-1',
            item: { id: 'item-1' },
            userId: 'user-1',
          }),
          organizationId: 'org-1',
        }),
      );
      expect(result.item.status).toBe(ContentPlanItemStatus.EXECUTING);
    });
  });

  describe('getCurrentPlan', () => {
    it('returns null when there is no recorded plan', async () => {
      brandMemoryService.listTypedEntries.mockResolvedValue([]);

      await expect(
        service.getCurrentPlan('org-1', 'brand-1'),
      ).resolves.toBeNull();
      expect(contentPlansService.getByIdOrFail).not.toHaveBeenCalled();
    });

    it('returns null when the recorded plan was deleted', async () => {
      brandMemoryService.listTypedEntries.mockResolvedValue([
        {
          content: 'generated',
          metadata: { planId: 'plan-1', status: 'generated' },
          type: 'expert-path.first-system',
        },
      ]);
      contentPlansService.getByIdOrFail.mockRejectedValue(
        new NotFoundException('ContentPlan', 'plan-1'),
      );

      await expect(
        service.getCurrentPlan('org-1', 'brand-1'),
      ).resolves.toBeNull();
    });

    it('returns the plan and items when the recorded plan still exists', async () => {
      brandMemoryService.listTypedEntries.mockResolvedValue([
        {
          content: 'generated',
          metadata: { planId: 'plan-1', status: 'generated' },
          type: 'expert-path.first-system',
        },
      ]);
      contentPlansService.getByIdOrFail.mockResolvedValue({ id: 'plan-1' });
      contentPlanItemsService.listByPlan.mockResolvedValue([{ id: 'item-1' }]);

      await expect(service.getCurrentPlan('org-1', 'brand-1')).resolves.toEqual(
        {
          items: [{ id: 'item-1' }],
          plan: { id: 'plan-1' },
        },
      );
    });
  });
});
