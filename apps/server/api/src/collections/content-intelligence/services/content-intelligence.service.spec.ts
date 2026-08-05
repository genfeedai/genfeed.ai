import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import {
  ContentIntelligencePlatform,
  CreatorAnalysisStatus,
} from '@genfeedai/enums';

describe('ContentIntelligenceService Prisma boundary', () => {
  const create = vi.fn();
  const findFirst = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const organizationId = 'organization-1';
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
    const result = await service.addCreator(organizationId, 'user-1', {
      handle: '@creator',
      platform: ContentIntelligencePlatform.TWITTER,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        createdById: 'user-1',
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
});
