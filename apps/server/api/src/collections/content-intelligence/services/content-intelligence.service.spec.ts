import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import {
  ContentIntelligencePlatform,
  CreatorAnalysisStatus,
} from '@genfeedai/enums';
import { NotFoundException } from '@server/exceptions/not-found.exception';

describe('ContentIntelligenceService Prisma boundary', () => {
  const create = vi.fn();
  const findFirst = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const organizationId = '550e8400-e29b-41d4-a716-446655440001';
  const userId = '550e8400-e29b-41d4-a716-446655440002';
  let service: ContentIntelligenceService;

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockImplementation(async ({ data }) => ({
      createdAt: new Date(),
      id: 'creator-1',
      isDeleted: false,
      updatedAt: new Date(),
      ...data,
    }));
    service = new ContentIntelligenceService(
      {
        creatorAnalysis: { create, findFirst, findUnique, update },
      } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    );
  });

  it('stores creator domain fields in data and ownership in scalar columns', async () => {
    const result = await service.addCreator(organizationId, userId, {
      handle: '@creator',
      platform: ContentIntelligencePlatform.TWITTER,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        createdById: userId,
        data: expect.objectContaining({
          handle: '@creator',
          platform: ContentIntelligencePlatform.TWITTER,
          status: CreatorAnalysisStatus.PENDING,
        }),
        organizationId,
      },
    });
    expect(result).toMatchObject({
      handle: '@creator',
      organizationId,
    });
  });

  it('queries creator identity through canonical JSON paths', async () => {
    findFirst.mockResolvedValue(null);

    await service.findByHandle(
      organizationId,
      ContentIntelligencePlatform.TWITTER,
      '@creator',
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { data: { equals: '@creator', path: ['handle'] } },
          {
            data: {
              equals: ContentIntelligencePlatform.TWITTER,
              path: ['platform'],
            },
          },
        ],
        isDeleted: false,
        organizationId,
      },
    });
  });

  it('returns the canonical 404 when updating a missing creator analysis', async () => {
    findUnique.mockResolvedValue(null);

    try {
      await service.updateStatus(
        'creator-missing',
        CreatorAnalysisStatus.FAILED,
      );
      expect.unreachable('expected a NotFoundException');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getStatus()).toBe(404);
      expect(error).toMatchObject({ message: 'Creator analysis not found' });
    }

    expect(update).not.toHaveBeenCalled();
  });
});
