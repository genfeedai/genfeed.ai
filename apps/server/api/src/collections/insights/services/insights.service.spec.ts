import { InsightsService } from '@api/collections/insights/services/insights.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

type MockInsightDelegate = {
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

describe('InsightsService.update', () => {
  let service: InsightsService;
  let delegate: MockInsightDelegate;

  const existing = {
    data: { forecast: { value: 42 }, isRead: false },
    id: 'insight-1',
    isDeleted: false,
    organizationId: 'org-1',
  };

  beforeEach(() => {
    delegate = {
      findFirst: vi.fn().mockResolvedValue(existing),
      update: vi
        .fn()
        .mockImplementation(({ data }) => ({ ...existing, ...data })),
    };

    service = new InsightsService(
      { insight: delegate } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {} as unknown as ModelsService,
      {} as unknown as ReplicateService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('merges isRead into the data blob while preserving other keys', async () => {
    await service.update('insight-1', 'org-1', { isRead: true });

    expect(delegate.update).toHaveBeenCalledWith({
      data: { data: { forecast: { value: 42 }, isRead: true } },
      where: { id: 'insight-1' },
    });
  });

  it('merges isDismissed into the data blob', async () => {
    await service.update('insight-1', 'org-1', { isDismissed: true });

    expect(delegate.update).toHaveBeenCalledWith({
      data: {
        data: { forecast: { value: 42 }, isDismissed: true, isRead: false },
      },
      where: { id: 'insight-1' },
    });
  });

  it('applies both flags at once', async () => {
    await service.update('insight-1', 'org-1', {
      isDismissed: true,
      isRead: true,
    });

    expect(delegate.update).toHaveBeenCalledWith({
      data: {
        data: { forecast: { value: 42 }, isDismissed: true, isRead: true },
      },
      where: { id: 'insight-1' },
    });
  });

  it('throws when the insight is not found', async () => {
    delegate.findFirst.mockResolvedValue(null);

    await expect(
      service.update('missing', 'org-1', { isRead: true }),
    ).rejects.toThrow('Insight not found');
  });
});
