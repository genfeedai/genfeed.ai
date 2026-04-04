import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { ActivityEntityModel } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';

interface MockModel {
  updateMany: ReturnType<typeof vi.fn>;
}

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let model: MockModel;
  let streaksService: {
    checkAndUpdate: ReturnType<typeof vi.fn>;
    isQualifyingActivityKey: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockModel: MockModel = {
    updateMany: vi.fn(),
  };

  beforeEach(() => {
    streaksService = {
      checkAndUpdate: vi.fn(),
      isQualifyingActivityKey: vi.fn().mockReturnValue(false),
    };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
    };
    service = new ActivitiesService(
      mockModel as never,
      logger as unknown as LoggerService,
      streaksService as unknown as StreaksService,
    );
    model = mockModel;
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── bulkPatch ────────────────────────────────────────────────────────

  describe('bulkPatch', () => {
    it('should update activities matching filter', async () => {
      const updateResult = { matchedCount: 2, modifiedCount: 2 };
      model.updateMany.mockReturnValue({
        exec: vi.fn().mockResolvedValue(updateResult),
      });

      const filter = { status: 'draft' };
      const updateDto = { filter: { status: 'draft' }, status: 'completed' };

      const result = await service.bulkPatch(filter, updateDto);

      expect(model.updateMany).toHaveBeenCalledWith(filter, {
        $set: { status: 'completed' },
      });
      expect(result).toEqual(updateResult);
    });

    it('strips the filter field from updateDto before applying $set', async () => {
      model.updateMany.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
      });

      await service.bulkPatch(
        { organization: 'org-1' },
        { filter: { organization: 'org-1' }, isDeleted: false, isRead: true },
      );

      const setArg = model.updateMany.mock.calls[0][1];
      expect(setArg.$set).not.toHaveProperty('filter');
      expect(setArg.$set).toEqual({ isDeleted: false, isRead: true });
    });

    it('throws when updateDto is null or not an object', async () => {
      await expect(service.bulkPatch({}, null as never)).rejects.toThrow(
        'Update data is required',
      );
    });

    it('returns counts from the update result', async () => {
      model.updateMany.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ matchedCount: 5, modifiedCount: 3 }),
      });

      const result = await service.bulkPatch(
        { isRead: false },
        { isRead: true },
      );

      expect(result.matchedCount).toBe(5);
      expect(result.modifiedCount).toBe(3);
    });

    it('re-throws errors from the database', async () => {
      model.updateMany.mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('Connection lost')),
      });

      await expect(
        service.bulkPatch({ isRead: false }, { isRead: true }),
      ).rejects.toThrow('Connection lost');
    });
  });

  // ── buildEntityLookup ────────────────────────────────────────────────

  describe('buildEntityLookup', () => {
    it('returns an array of pipeline stages', () => {
      const stages = ActivitiesService.buildEntityLookup();
      expect(Array.isArray(stages)).toBe(true);
      expect(stages.length).toBeGreaterThanOrEqual(4);
    });

    it('includes $lookup stages for ingredients, posts, and articles', () => {
      const stages = ActivitiesService.buildEntityLookup();
      const lookups = stages.filter((s) => '$lookup' in s) as Array<{
        $lookup: { from: string };
      }>;

      const collections = lookups.map((l) => l.$lookup.from);
      expect(collections).toContain('ingredients');
      expect(collections).toContain('posts');
      expect(collections).toContain('articles');
    });

    it('includes an $addFields stage combining entity types', () => {
      const stages = ActivitiesService.buildEntityLookup();
      const addFieldsStage = stages.find((s) => '$addFields' in s) as
        | { $addFields: Record<string, unknown> }
        | undefined;

      expect(addFieldsStage).toBeDefined();
      expect(addFieldsStage!.$addFields).toHaveProperty('entity');
    });

    it('references ActivityEntityModel values in pipeline expressions', () => {
      const stages = ActivitiesService.buildEntityLookup();
      const serialized = JSON.stringify(stages);

      expect(serialized).toContain(ActivityEntityModel.INGREDIENT);
      expect(serialized).toContain(ActivityEntityModel.POST);
      expect(serialized).toContain(ActivityEntityModel.ARTICLE);
    });
  });
});
