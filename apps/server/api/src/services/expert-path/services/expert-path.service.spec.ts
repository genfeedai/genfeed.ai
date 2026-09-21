import type { HarnessProfileDocument } from '@api/collections/harness-profiles/schemas/harness-profile.schema';
import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ExpertCorpusService } from '@api/services/expert-path/services/expert-corpus.service';
import type { ExpertFirstSystemService } from '@api/services/expert-path/services/expert-first-system.service';
import { ExpertPathService } from '@api/services/expert-path/services/expert-path.service';
import type { ExpertPositioningService } from '@api/services/expert-path/services/expert-positioning.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IExpertFirstSystemReadiness } from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const READINESS: IExpertFirstSystemReadiness = {
  creditCost: 10,
  isReady: false,
  isUsingInterviewPlatforms: true,
  missing: ['positioning', 'corpus'],
  platforms: [],
};

describe('ExpertPathService', () => {
  let service: ExpertPathService;
  let organizationDelegate: { findFirst: ReturnType<typeof vi.fn> };
  let brandDelegate: { findFirst: ReturnType<typeof vi.fn> };
  let expertCorpusService: { summarize: ReturnType<typeof vi.fn> };
  let expertFirstSystemService: {
    readRecord: ReturnType<typeof vi.fn>;
    getReadiness: ReturnType<typeof vi.fn>;
  };
  let expertPositioningService: { readAnswers: ReturnType<typeof vi.fn> };
  let harnessProfilesService: { getActiveForBrand: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    organizationDelegate = {
      findFirst: vi.fn().mockResolvedValue({ accountType: 'CREATOR' }),
    };
    brandDelegate = {
      findFirst: vi.fn().mockResolvedValue({
        agentConfig: {},
        id: 'brand-1',
      }),
    };
    expertCorpusService = {
      summarize: vi
        .fn()
        .mockResolvedValue({ readySourceIds: [], sourceCount: 0 }),
    };
    expertFirstSystemService = {
      getReadiness: vi.fn().mockResolvedValue(READINESS),
      readRecord: vi.fn().mockResolvedValue({ status: 'none' }),
    };
    expertPositioningService = {
      readAnswers: vi.fn().mockResolvedValue({}),
    };
    harnessProfilesService = {
      getActiveForBrand: vi.fn().mockResolvedValue(null),
    };

    service = new ExpertPathService(
      {
        brand: brandDelegate,
        organization: organizationDelegate,
      } as unknown as PrismaService,
      expertCorpusService as unknown as ExpertCorpusService,
      expertFirstSystemService as unknown as ExpertFirstSystemService,
      expertPositioningService as unknown as ExpertPositioningService,
      harnessProfilesService as unknown as HarnessProfilesService,
    );
  });

  it('throws NotFoundException for a missing brand', async () => {
    brandDelegate.findFirst.mockResolvedValue(null);

    await expect(
      service.getStatus('org-1', 'brand-missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports isExpert true only when the organization accountType is EXPERT', async () => {
    organizationDelegate.findFirst.mockResolvedValue({ accountType: 'EXPERT' });

    const status = await service.getStatus('org-1', 'brand-1');

    expect(status.isExpert).toBe(true);
  });

  it('reports isExpert false for a non-expert organization', async () => {
    organizationDelegate.findFirst.mockResolvedValue({
      accountType: 'CREATOR',
    });

    const status = await service.getStatus('org-1', 'brand-1');

    expect(status.isExpert).toBe(false);
  });

  it('reports positioning counts, score and harnessProfileId from the active profile', async () => {
    expertPositioningService.readAnswers.mockResolvedValue({
      bigDomino: 'answer',
      originStory: 'answer',
    });
    const positioning = {
      dimensions: [],
      rating: 'needs_work',
      scoredAt: '2026-01-01T00:00:00.000Z',
      totalScore: 60,
      version: 1,
      weakestDimension: 'bigDomino',
    };
    harnessProfilesService.getActiveForBrand.mockResolvedValue({
      id: 'profile-1',
      positioning,
    } as unknown as HarnessProfileDocument);

    const status = await service.getStatus('org-1', 'brand-1');

    expect(status.positioning).toEqual({
      answeredCount: 2,
      harnessProfileId: 'profile-1',
      isComplete: true,
      score: positioning,
      totalCount: 7,
    });
  });

  it('reports positioning incomplete without a harnessProfileId/score when no profile has positioning', async () => {
    harnessProfilesService.getActiveForBrand.mockResolvedValue(null);

    const status = await service.getStatus('org-1', 'brand-1');

    expect(status.positioning).toEqual({
      answeredCount: 0,
      isComplete: false,
      totalCount: 7,
    });
    expect(status.positioning).not.toHaveProperty('harnessProfileId');
    expect(status.positioning).not.toHaveProperty('score');
  });

  it('reports corpus counts from the corpus summary', async () => {
    expertCorpusService.summarize.mockResolvedValue({
      readySourceIds: ['source-1', 'source-2'],
      sourceCount: 3,
    });

    const status = await service.getStatus('org-1', 'brand-1');

    expect(status.corpus).toEqual({
      isComplete: true,
      readySourceCount: 2,
      sourceCount: 3,
    });
  });

  it('includes the first-system record and readiness verbatim', async () => {
    expertFirstSystemService.readRecord.mockResolvedValue({
      planId: 'plan-1',
      status: 'generated',
    });
    expertFirstSystemService.getReadiness.mockResolvedValue(READINESS);

    const status = await service.getStatus('org-1', 'brand-1');

    expect(status.firstSystem).toEqual({
      planId: 'plan-1',
      readiness: READINESS,
      status: 'generated',
    });
  });

  describe('publishApproval.isRequired', () => {
    it('is true only when autoPublish is { enabled: false, isApprovalRequired: true }', async () => {
      brandDelegate.findFirst.mockResolvedValue({
        agentConfig: {
          autoPublish: { enabled: false, isApprovalRequired: true },
        },
        id: 'brand-1',
      });

      const status = await service.getStatus('org-1', 'brand-1');

      expect(status.publishApproval).toEqual({ isRequired: true });
    });

    it('is false when autoPublish.enabled is true even with isApprovalRequired set', async () => {
      brandDelegate.findFirst.mockResolvedValue({
        agentConfig: {
          autoPublish: { enabled: true, isApprovalRequired: true },
        },
        id: 'brand-1',
      });

      const status = await service.getStatus('org-1', 'brand-1');

      expect(status.publishApproval).toEqual({ isRequired: false });
    });

    it('is false when isApprovalRequired is not set', async () => {
      brandDelegate.findFirst.mockResolvedValue({
        agentConfig: { autoPublish: { enabled: false } },
        id: 'brand-1',
      });

      const status = await service.getStatus('org-1', 'brand-1');

      expect(status.publishApproval).toEqual({ isRequired: false });
    });

    it('is false when there is no autoPublish config at all', async () => {
      brandDelegate.findFirst.mockResolvedValue({
        agentConfig: {},
        id: 'brand-1',
      });

      const status = await service.getStatus('org-1', 'brand-1');

      expect(status.publishApproval).toEqual({ isRequired: false });
    });
  });
});
