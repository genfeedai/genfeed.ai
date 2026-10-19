import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { OrganizationAppsReportService } from '@api/endpoints/admin/organization-apps-report/organization-apps-report.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: vi.fn(() => true),
}));

describe('OrganizationAppsReportService', () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const firstPage = { limit: 20, page: 1, skip: 0 };
  const getFeatureSettings = vi.fn();
  let service: OrganizationAppsReportService;

  beforeEach(async () => {
    vi.mocked(hasOrganizationBilling).mockReturnValue(true);
    findMany.mockReset();
    count.mockReset();
    count.mockResolvedValue(0);
    getFeatureSettings.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        OrganizationAppsReportService,
        {
          provide: PrismaService,
          useValue: { organization: { count, findMany } },
        },
        {
          provide: PlatformSettingsService,
          useValue: { getFeatureSettings },
        },
      ],
    }).compile();
    service = module.get(OrganizationAppsReportService);
  });

  it('pages non-deleted organizations in the database, ordered by label', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(45);
    getFeatureSettings.mockResolvedValue({ flags: {} });

    const report = await service.getReport({ limit: 20, page: 2, skip: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ label: 'asc' }, { id: 'asc' }],
        skip: 20,
        take: 20,
        where: { isDeleted: false },
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { isDeleted: false } });
    expect(report.pagination).toEqual({
      limit: 20,
      page: 2,
      pages: 3,
      total: 45,
    });
  });

  it('applies the organization switch and the release rules per app', async () => {
    findMany.mockResolvedValue([
      {
        id: 'org_new',
        label: 'New Org',
        settings: {
          isReleasePreviewEnabled: false,
          moduleOverrides: { storyboard: false },
          releasedItemIds: [],
          subscriptionTier: 'free',
        },
        slug: 'new-org',
      },
      {
        id: 'org_preview',
        label: 'Preview Org',
        settings: {
          isReleasePreviewEnabled: true,
          moduleOverrides: {},
          releasedItemIds: ['clips'],
          subscriptionTier: null,
        },
        slug: 'preview-org',
      },
    ]);
    getFeatureSettings.mockResolvedValue({
      flags: { release_publishing: true },
    });

    const report = await service.getReport(firstPage);
    const [newOrg, previewOrg] = report.organizations;

    expect(newOrg?.apps.playground).toEqual({
      isReleased: true,
      isVisible: true,
    });
    expect(newOrg?.apps.storyboard).toEqual({
      isReleased: true,
      isVisible: false,
    });
    expect(newOrg?.apps.publishing).toEqual({
      isReleased: true,
      isVisible: true,
    });
    expect(newOrg?.apps.analytics).toEqual({
      isReleased: false,
      isVisible: false,
    });
    expect(newOrg?.apps.clips.isVisible).toBe(false);
    expect(previewOrg?.apps.analytics.isReleased).toBe(true);
    expect(previewOrg?.apps.clips.isReleased).toBe(true);
    expect(report.releaseFlags.release_publishing).toBe(true);
    expect(report.releaseFlags.release_analytics).toBe(false);
  });

  it('treats an organization without settings as having no switches', async () => {
    findMany.mockResolvedValue([
      { id: 'org_bare', label: 'Bare', settings: null, slug: 'bare' },
    ]);
    getFeatureSettings.mockResolvedValue({ flags: {} });

    const [bare] = (await service.getReport(firstPage)).organizations;

    expect(bare?.subscriptionTier).toBeNull();
    expect(bare?.apps.playground.isVisible).toBe(true);
  });
});
