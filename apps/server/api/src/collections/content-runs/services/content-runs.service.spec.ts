import { ContentRun } from '@api/collections/content-runs/schemas/content-run.schema';
import {
  ContentRunsService,
  type CreateContentRunInput,
} from '@api/collections/content-runs/services/content-runs.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ContentRunSource, ContentRunStatus } from '@genfeedai/enums';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

describe('ContentRunsService', () => {
  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();
  const runId = new Types.ObjectId().toString();

  let service: ContentRunsService;

  const mockModel = {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentRunsService,
        {
          provide: getModelToken(ContentRun.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get(ContentRunsService);
  });

  describe('createRun', () => {
    const input: CreateContentRunInput = {
      brand: brandId,
      brief: {
        angle: 'Founder-led breakdown',
        audience: 'Indie founders',
        evidence: ['high comment velocity', 'repeat founder pain'],
        hypothesis: 'Specific founder pain will outperform generic AI hype',
      },
      creditsUsed: 10,
      input: { prompt: 'Write a post about AI' },
      organization: orgId,
      publish: {
        experimentId: 'exp-founder-loop',
        metadata: { slot: 'morning' },
        platform: 'twitter',
        scheduledFor: new Date('2026-04-14T09:00:00.000Z'),
      },
      recommendations: [
        {
          action: 'Turn the winner into a thread',
          confidence: 0.81,
          metadata: { source: 'analytics' },
          rationale: 'Long-form follow-up matches the winning hook',
          type: 'extend-winner',
        },
      ],
      skillSlug: 'content-writing',
      source: ContentRunSource.HOSTED,
      status: ContentRunStatus.PENDING,
      variants: [
        {
          id: 'variant-a',
          metadata: { hook: 'pain-first' },
          platform: 'twitter',
          type: 'post',
        },
      ],
    };

    it('creates a run with ObjectId-converted brand and org', async () => {
      mockModel.create.mockResolvedValue({ _id: runId, ...input });

      await service.createRun(input);

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.any(Types.ObjectId),
          brief: input.brief,
          creditsUsed: 10,
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
          publish: input.publish,
          recommendations: input.recommendations,
          skillSlug: 'content-writing',
          variants: input.variants,
        }),
      );
    });

    it('preserves input data in the created document', async () => {
      mockModel.create.mockResolvedValue({ _id: runId, ...input });

      const result = await service.createRun(input);

      expect(result.skillSlug).toBe('content-writing');
      expect(result.creditsUsed).toBe(10);
      expect(result.brief?.hypothesis).toBe(
        'Specific founder pain will outperform generic AI hype',
      );
      expect(result.variants?.[0]?.id).toBe('variant-a');
    });
  });

  describe('patchRun', () => {
    it('patches a run scoped to org', async () => {
      mockModel.findOneAndUpdate.mockResolvedValue({
        _id: runId,
        status: ContentRunStatus.COMPLETED,
      });

      const result = await service.patchRun(orgId, runId, {
        duration: 5000,
        status: ContentRunStatus.COMPLETED,
      });

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Types.ObjectId),
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
        }),
        { $set: { duration: 5000, status: ContentRunStatus.COMPLETED } },
        { new: true },
      );
      expect(result.status).toBe(ContentRunStatus.COMPLETED);
    });

    it('patches lifecycle fields without introducing a parallel run contract', async () => {
      const analyticsSummary = {
        engagementRate: 0.17,
        impressions: 4200,
        metadata: { window: '7d' },
        summary: 'Founder-led hook outperformed baseline',
        topSignals: ['saves', 'qualified replies'],
        winningVariantId: 'variant-b',
      };
      const recommendations = [
        {
          action: 'Repurpose into LinkedIn carousel',
          confidence: 0.76,
          metadata: { priority: 'next' },
          rationale: 'Winning variant maps to a longer-form visual format',
          type: 'repurpose',
        },
      ];

      mockModel.findOneAndUpdate.mockResolvedValue({
        _id: runId,
        analyticsSummary,
        recommendations,
        status: ContentRunStatus.COMPLETED,
      });

      const result = await service.patchRun(orgId, runId, {
        analyticsSummary,
        recommendations,
        status: ContentRunStatus.COMPLETED,
      });

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Types.ObjectId),
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
        }),
        {
          $set: {
            analyticsSummary,
            recommendations,
            status: ContentRunStatus.COMPLETED,
          },
        },
        { new: true },
      );
      expect(result.analyticsSummary).toEqual(analyticsSummary);
      expect(result.recommendations).toEqual(recommendations);
    });

    it('throws NotFoundException when run not found', async () => {
      mockModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.patchRun(orgId, runId, {
          error: 'timeout',
          status: ContentRunStatus.FAILED,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('patches with error information on failure', async () => {
      mockModel.findOneAndUpdate.mockResolvedValue({
        _id: runId,
        error: 'Provider timeout',
        status: ContentRunStatus.FAILED,
      });

      const result = await service.patchRun(orgId, runId, {
        error: 'Provider timeout',
        status: ContentRunStatus.FAILED,
      });

      expect(result.error).toBe('Provider timeout');
    });
  });

  describe('listByBrand', () => {
    it('lists runs scoped to org and brand', async () => {
      mockModel.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
        sort: vi.fn().mockReturnThis(),
      });

      await service.listByBrand(orgId, brandId);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.any(Types.ObjectId),
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
        }),
      );
    });

    it('adds skillSlug filter when provided', async () => {
      mockModel.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
        sort: vi.fn().mockReturnThis(),
      });

      await service.listByBrand(orgId, brandId, 'content-writing');

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          skillSlug: 'content-writing',
        }),
      );
    });

    it('adds status filter when provided', async () => {
      mockModel.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
        sort: vi.fn().mockReturnThis(),
      });

      await service.listByBrand(
        orgId,
        brandId,
        undefined,
        ContentRunStatus.COMPLETED,
      );

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ContentRunStatus.COMPLETED,
        }),
      );
    });

    it('does not include skillSlug/status when not provided', async () => {
      mockModel.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
        sort: vi.fn().mockReturnThis(),
      });

      await service.listByBrand(orgId, brandId);

      const query = mockModel.find.mock.calls[0][0];
      expect(query).not.toHaveProperty('skillSlug');
      expect(query).not.toHaveProperty('status');
    });

    it('sorts results by createdAt descending', async () => {
      const sortMock = vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      });
      mockModel.find.mockReturnValue({ sort: sortMock });

      await service.listByBrand(orgId, brandId);

      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe('getRunById', () => {
    it('finds a run by id scoped to org', async () => {
      mockModel.findOne.mockResolvedValue({
        _id: runId,
        status: ContentRunStatus.COMPLETED,
      });

      const result = await service.getRunById(orgId, runId);

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Types.ObjectId),
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
        }),
      );
      expect(result?.status).toBe(ContentRunStatus.COMPLETED);
    });

    it('returns null when run not found', async () => {
      mockModel.findOne.mockResolvedValue(null);

      const result = await service.getRunById(orgId, runId);
      expect(result).toBeNull();
    });
  });
});
