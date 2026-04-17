import { ContentDraftStatus } from '@api/collections/content-drafts/schemas/content-draft.schema';
import { ContentReviewService } from '@api/services/content-engine/content-review.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('ContentReviewService', () => {
  let service: ContentReviewService;
  let mockContentDraftsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockBrandsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockLogger: Record<string, ReturnType<typeof vi.fn>>;

  const orgId = 'test-object-id';
  const brandId = 'test-object-id';
  const draftId = 'test-object-id';
  const userId = 'test-object-id';

  beforeEach(() => {
    mockContentDraftsService = {
      approve: vi.fn(),
      bulkApprove: vi.fn(),
      listByBrand: vi.fn(),
      reject: vi.fn(),
    };

    mockBrandsService = {
      findOne: vi.fn(),
    };

    mockLogger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new ContentReviewService(
      mockContentDraftsService as any,
      mockBrandsService as any,
      mockLogger as unknown as LoggerService,
    );
  });

  // ---------------------------------------------------------------------------
  // getQueue
  // ---------------------------------------------------------------------------
  describe('getQueue', () => {
    it('should delegate to contentDraftsService.listByBrand with PENDING status', async () => {
      const mockDrafts = [{ _id: 'test-object-id' }];
      mockContentDraftsService.listByBrand.mockResolvedValue(mockDrafts);

      const result = await service.getQueue(orgId, brandId);

      expect(mockContentDraftsService.listByBrand).toHaveBeenCalledWith(
        orgId,
        brandId,
        ContentDraftStatus.PENDING,
      );
      expect(result).toBe(mockDrafts);
    });

    it('should return an empty array when no pending drafts exist', async () => {
      mockContentDraftsService.listByBrand.mockResolvedValue([]);

      const result = await service.getQueue(orgId, brandId);

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // approveDraft
  // ---------------------------------------------------------------------------
  describe('approveDraft', () => {
    it('should call contentDraftsService.approve with the correct args', async () => {
      const mockDraft = { _id: draftId, status: ContentDraftStatus.APPROVED };
      mockContentDraftsService.approve.mockResolvedValue(mockDraft);

      const result = await service.approveDraft(orgId, draftId, userId);

      expect(mockContentDraftsService.approve).toHaveBeenCalledWith(
        draftId,
        orgId,
        userId,
      );
      expect(result).toBe(mockDraft);
    });

    it('should propagate errors from contentDraftsService.approve', async () => {
      mockContentDraftsService.approve.mockRejectedValue(
        new Error('Draft not found'),
      );

      await expect(
        service.approveDraft(orgId, draftId, userId),
      ).rejects.toThrow('Draft not found');
    });
  });

  // ---------------------------------------------------------------------------
  // rejectDraft
  // ---------------------------------------------------------------------------
  describe('rejectDraft', () => {
    it('should call contentDraftsService.reject with reason', async () => {
      const mockDraft = { _id: draftId, status: ContentDraftStatus.REJECTED };
      mockContentDraftsService.reject.mockResolvedValue(mockDraft);

      const result = await service.rejectDraft(orgId, draftId, 'Not good');

      expect(mockContentDraftsService.reject).toHaveBeenCalledWith(
        draftId,
        orgId,
        'Not good',
      );
      expect(result).toBe(mockDraft);
    });

    it('should call contentDraftsService.reject without reason', async () => {
      const mockDraft = { _id: draftId };
      mockContentDraftsService.reject.mockResolvedValue(mockDraft);

      await service.rejectDraft(orgId, draftId);

      expect(mockContentDraftsService.reject).toHaveBeenCalledWith(
        draftId,
        orgId,
        undefined,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // bulkApprove
  // ---------------------------------------------------------------------------
  describe('bulkApprove', () => {
    it('should delegate to contentDraftsService.bulkApprove', async () => {
      const ids = [draftId, 'test-object-id'];
      mockContentDraftsService.bulkApprove.mockResolvedValue({
        modifiedCount: 2,
      });

      const result = await service.bulkApprove(orgId, ids, userId);

      expect(mockContentDraftsService.bulkApprove).toHaveBeenCalledWith(
        ids,
        orgId,
        userId,
      );
      expect(result).toEqual({ modifiedCount: 2 });
    });
  });

  // ---------------------------------------------------------------------------
  // autoApproveIfEligible
  // ---------------------------------------------------------------------------
  describe('autoApproveIfEligible', () => {
    it('should return false when confidence is undefined', async () => {
      const result = await service.autoApproveIfEligible(
        orgId,
        brandId,
        draftId,
      );

      expect(result).toBe(false);
      expect(mockBrandsService.findOne).not.toHaveBeenCalled();
    });

    it('should return false when brand is not found', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = await service.autoApproveIfEligible(
        orgId,
        brandId,
        draftId,
        0.9,
      );

      expect(result).toBe(false);
      expect(mockContentDraftsService.approve).not.toHaveBeenCalled();
    });

    it('should return false when autoPublish is not enabled', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        agentConfig: { autoPublish: { enabled: false } },
      });

      const result = await service.autoApproveIfEligible(
        orgId,
        brandId,
        draftId,
        0.9,
      );

      expect(result).toBe(false);
    });

    it('should return false when autoPublish config is missing', async () => {
      mockBrandsService.findOne.mockResolvedValue({ agentConfig: {} });

      const result = await service.autoApproveIfEligible(
        orgId,
        brandId,
        draftId,
        0.9,
      );

      expect(result).toBe(false);
    });

    it('should approve and return true when confidence meets the default threshold (0.8)', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        agentConfig: { autoPublish: { enabled: true } },
      });
      mockContentDraftsService.approve.mockResolvedValue({ _id: draftId });

      const result = await service.autoApproveIfEligible(
        orgId,
        brandId,
        draftId,
        0.85,
      );

      expect(result).toBe(true);
      expect(mockContentDraftsService.approve).toHaveBeenCalledWith(
        draftId,
        orgId,
        'system-auto-approve',
      );
      expect(mockLogger.log).toHaveBeenCalled();
    });

    it('should approve and return true when confidence equals threshold exactly', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        agentConfig: {
          autoPublish: { confidenceThreshold: 0.75, enabled: true },
        },
      });
      mockContentDraftsService.approve.mockResolvedValue({ _id: draftId });

      const result = await service.autoApproveIfEligible(
        orgId,
        brandId,
        draftId,
        0.75,
      );

      expect(result).toBe(true);
    });

    it('should return false when confidence is below custom threshold', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        agentConfig: {
          autoPublish: { confidenceThreshold: 0.9, enabled: true },
        },
      });

      const result = await service.autoApproveIfEligible(
        orgId,
        brandId,
        draftId,
        0.75,
      );

      expect(result).toBe(false);
      expect(mockContentDraftsService.approve).not.toHaveBeenCalled();
    });

    it('should return false when confidence is below the default threshold (0.8)', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        agentConfig: { autoPublish: { enabled: true } },
      });

      const result = await service.autoApproveIfEligible(
        orgId,
        brandId,
        draftId,
        0.5,
      );

      expect(result).toBe(false);
    });

    it('should query the brand with correct filter including ObjectId conversion', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await service.autoApproveIfEligible(orgId, brandId, draftId, 0.9);

      const callArg = mockBrandsService.findOne.mock.calls[0][0];
      expect(callArg).toMatchObject({
        isDeleted: false,
      });
      expect(callArg._id).toEqual(expect.any(String));
      expect(callArg.organization).toEqual(expect.any(String));
    });
  });
});
