import { AnalyticsAdminSummaryService } from '@api/endpoints/analytics/analytics-admin-summary.service';
import { BotStatus, WorkflowStatus } from '@genfeedai/contracts';

describe('AnalyticsAdminSummaryService', () => {
  const botsService = { findAll: vi.fn() };
  const brandsService = { findAll: vi.fn() };
  const ingredientsService = { findAll: vi.fn() };
  const modelsService = { findAll: vi.fn() };
  const organizationsService = { findAll: vi.fn() };
  const postsService = { findAll: vi.fn() };
  const subscriptionsService = { findAll: vi.fn() };
  const usersService = { findAll: vi.fn() };
  const workflowsService = { findAll: vi.fn() };
  const service = new AnalyticsAdminSummaryService(
    botsService as never,
    brandsService as never,
    ingredientsService as never,
    modelsService as never,
    organizationsService as never,
    postsService as never,
    subscriptionsService as never,
    usersService as never,
    workflowsService as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    botsService.findAll.mockResolvedValue({ total: 1 });
    brandsService.findAll.mockResolvedValue({ total: 3 });
    ingredientsService.findAll
      .mockResolvedValueOnce({ total: 5 })
      .mockResolvedValueOnce({ total: 9 });
    modelsService.findAll.mockResolvedValue({ total: 10 });
    organizationsService.findAll.mockResolvedValue({ total: 6 });
    postsService.findAll
      .mockResolvedValueOnce({ total: 12 })
      .mockResolvedValueOnce({ total: 7 });
    subscriptionsService.findAll.mockResolvedValue({ total: 4 });
    usersService.findAll.mockResolvedValue({ totalDocs: 8 });
    workflowsService.findAll.mockResolvedValue({ total: 2 });
  });

  it('aggregates and projects the established admin summary contract', async () => {
    const result = await service.getSummary({ limit: 25, page: 2 });

    expect(result).toEqual({
      activeBots: 1,
      activeWorkflows: 2,
      monthlyGrowth: 0,
      pendingPosts: 7,
      recentActivities: 0,
      totalBrands: 3,
      totalCredentialsConnected: 0,
      totalCredits: 0,
      totalImages: 9,
      totalModels: 10,
      totalOrganizations: 6,
      totalPosts: 12,
      totalSubscriptions: 4,
      totalUsers: 8,
      totalVideos: 5,
      totalViews: 0,
      viewsGrowth: 0,
    });

    const options = expect.objectContaining({
      customLabels: expect.any(Object),
      limit: 25,
      page: 2,
      pagination: true,
    });
    expect(subscriptionsService.findAll).toHaveBeenCalledWith(
      { where: {} },
      options,
    );
    expect(organizationsService.findAll).toHaveBeenCalledWith(
      { where: { isDeleted: false } },
      options,
    );
    expect(workflowsService.findAll).toHaveBeenCalledWith(
      { where: { isDeleted: false, status: WorkflowStatus.ACTIVE } },
      options,
    );
    expect(botsService.findAll).toHaveBeenCalledWith(
      { where: { isDeleted: false, status: BotStatus.ACTIVE } },
      options,
    );
    expect(modelsService.findAll).toHaveBeenCalledWith(
      { where: { isDeleted: false } },
      options,
    );
    expect(postsService.findAll.mock.calls[1]?.[0]).toEqual({
      where: {
        isDeleted: false,
        targetExecutionState: 'publishing',
      },
    });
    expect(botsService.findAll.mock.calls[0]?.[0]?.where).not.toHaveProperty(
      'enabled',
    );
  });

  it('preserves zero fallbacks for missing or malformed totals', async () => {
    botsService.findAll.mockResolvedValueOnce(undefined);
    brandsService.findAll.mockResolvedValueOnce({ total: '3' });
    ingredientsService.findAll
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ totalDocs: Number.NaN });
    modelsService.findAll.mockResolvedValueOnce({});
    organizationsService.findAll.mockResolvedValueOnce({ totalDocs: 6 });
    postsService.findAll
      .mockReset()
      .mockResolvedValueOnce({ totalDocs: 12 })
      .mockResolvedValueOnce({ totalDocs: 7 });
    subscriptionsService.findAll.mockResolvedValueOnce({ total: 4 });
    usersService.findAll.mockResolvedValueOnce({ totalDocs: 8 });
    workflowsService.findAll.mockResolvedValueOnce({ total: 2 });

    await expect(service.getSummary({})).resolves.toMatchObject({
      activeBots: 0,
      pendingPosts: 7,
      totalBrands: 0,
      totalImages: Number.NaN,
      totalModels: 0,
      totalOrganizations: 6,
      totalPosts: 12,
      totalVideos: 0,
    });
  });
});
