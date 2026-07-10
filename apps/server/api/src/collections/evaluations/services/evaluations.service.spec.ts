import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { Status } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMocks() {
  const prisma = {
    evaluation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    creditsUtilsService: {
      checkOrganizationCreditsAvailable: vi.fn(),
      deductCreditsFromOrganization: vi.fn(),
      getOrganizationCreditsBalance: vi.fn(),
      refundOrganizationCredits: vi.fn(),
    },
    evaluationsOperationsService: {},
    logger: {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    prisma,
    videosService: {
      findOne: vi.fn(),
    },
    websocketService: {
      emit: vi.fn(),
    },
  };
}

describe('EvaluationsService review and comparison workflow', () => {
  let service: EvaluationsService;
  let mocks: ReturnType<typeof createMocks>;

  const organizationId = 'org-123';
  const reviewerId = 'user-123';

  beforeEach(() => {
    mocks = createMocks();
    service = new EvaluationsService(
      mocks.prisma as never,
      mocks.logger as never,
      mocks.evaluationsOperationsService as never,
      mocks.creditsUtilsService as never,
      mocks.websocketService as never,
      undefined,
      mocks.videosService as never,
    );
  });

  describe('evaluateVideo organization scoping', () => {
    it('should scope the video lookup to the caller organization and 404 on a foreign video', async () => {
      mocks.videosService.findOne.mockResolvedValue(null);

      await expect(
        service.evaluateVideo(
          'video-1',
          'pre_publication' as never,
          organizationId,
          reviewerId,
          'brand-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mocks.videosService.findOne).toHaveBeenCalledWith(
        { _id: 'video-1', isDeleted: false, organizationId },
        expect.any(Array),
      );
    });
  });

  describe('syncPostPublicationPerformance organization scoping', () => {
    it('should throw not found when the evaluation is outside the organization', async () => {
      mocks.prisma.evaluation.findFirst.mockResolvedValue(null);

      await expect(
        service.syncPostPublicationPerformance('eval-1', organizationId, {
          engagement: 42,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mocks.prisma.evaluation.findFirst).toHaveBeenCalledWith({
        where: { id: 'eval-1', isDeleted: false, organizationId },
      });
    });
  });

  describe('recordReviewerFeedback', () => {
    it('should update an organization-scoped evaluation with review metadata', async () => {
      mocks.prisma.evaluation.findFirst.mockResolvedValue({
        data: {
          reviewerComments: [
            {
              comment: 'Earlier note.',
              createdAt: '2026-07-01T00:00:00.000Z',
              reviewerId: 'user-456',
            },
          ],
          status: Status.COMPLETED,
        },
        id: 'eval-1',
      });
      mocks.prisma.evaluation.update.mockImplementation(async ({ data }) => ({
        data: data.data,
        id: 'eval-1',
      }));

      const result = await service.recordReviewerFeedback(
        'eval-1',
        organizationId,
        reviewerId,
        {
          comment: 'Use this model for launch posts.',
          decision: 'approved',
          reviewerScore: 92,
          tags: [' launch ', 'video'],
        },
      );

      expect(mocks.prisma.evaluation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'eval-1',
          isDeleted: false,
          organizationId,
        },
      });
      expect(mocks.prisma.evaluation.update).toHaveBeenCalledWith({
        where: { id: 'eval-1' },
        data: {
          data: expect.objectContaining({
            review: expect.objectContaining({
              comment: 'Use this model for launch posts.',
              decision: 'approved',
              reviewerId,
              reviewerScore: 92,
              tags: ['launch', 'video'],
            }),
            reviewerComments: expect.arrayContaining([
              expect.objectContaining({
                comment: 'Use this model for launch posts.',
                reviewerId,
              }),
            ]),
          }),
        },
      });
      expect(result.data).toEqual(
        expect.objectContaining({
          review: expect.objectContaining({ reviewerScore: 92 }),
        }),
      );
    });

    it('should throw not found when the evaluation is outside the organization', async () => {
      mocks.prisma.evaluation.findFirst.mockResolvedValue(null);

      await expect(
        service.recordReviewerFeedback(
          'missing-eval',
          organizationId,
          reviewerId,
          { reviewerScore: 80 },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject empty review feedback', async () => {
      await expect(
        service.recordReviewerFeedback(
          'eval-1',
          organizationId,
          reviewerId,
          {},
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('compareEvaluations', () => {
    it('should rank completed evaluations by composite score', async () => {
      mocks.prisma.evaluation.findMany.mockResolvedValue([
        {
          contentId: 'post-b',
          contentType: 'post',
          data: {
            analysis: {
              strengths: ['Clear CTA'],
              weaknesses: ['Generic hook'],
            },
            evaluationType: 'pre_publication',
            overallScore: 70,
            review: {
              comment: 'Useful but less distinctive.',
              reviewerScore: 68,
            },
            scores: {
              brand: { overall: 70 },
              engagement: { overall: 70 },
              technical: { overall: 70 },
            },
            status: Status.COMPLETED,
          },
          id: 'eval-b',
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          contentId: 'post-a',
          contentType: 'post',
          data: {
            analysis: {
              strengths: ['Strong hook'],
              weaknesses: ['Needs shorter CTA'],
            },
            evaluationType: 'pre_publication',
            overallScore: 85,
            review: {
              comment: 'Best candidate.',
              reviewedAt: '2026-07-02T00:00:00.000Z',
              reviewerScore: 90,
            },
            scores: {
              brand: { overall: 82 },
              engagement: { overall: 88 },
              technical: { overall: 80 },
            },
            status: Status.COMPLETED,
          },
          id: 'eval-a',
          updatedAt: new Date('2026-07-02T00:00:00.000Z'),
        },
      ]);

      const result = await service.compareEvaluations(organizationId, {
        evaluationIds: ['eval-a', 'eval-b'],
      });

      expect(mocks.prisma.evaluation.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['eval-a', 'eval-b'] },
          isDeleted: false,
          organizationId,
        },
        orderBy: { updatedAt: 'desc' },
        take: 2,
      });
      expect(result.winnerEvaluationId).toBe('eval-a');
      expect(result.rankings).toMatchObject([
        {
          evaluationId: 'eval-a',
          rank: 1,
          reviewerComment: 'Best candidate.',
          scoreBreakdown: {
            modelScore: 85,
            reviewerScore: 90,
          },
        },
        {
          evaluationId: 'eval-b',
          rank: 2,
        },
      ]);
    });

    it('should reject incomplete evaluations by default', async () => {
      mocks.prisma.evaluation.findMany.mockResolvedValue([
        {
          data: { status: Status.COMPLETED },
          id: 'eval-a',
          updatedAt: new Date('2026-07-02T00:00:00.000Z'),
        },
        {
          data: { status: Status.PROCESSING },
          id: 'eval-b',
          updatedAt: new Date('2026-07-02T00:00:00.000Z'),
        },
      ]);

      await expect(
        service.compareEvaluations(organizationId, {
          evaluationIds: ['eval-a', 'eval-b'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
