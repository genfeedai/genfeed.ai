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
  const getFeatureSettings = vi.fn();
  let service: OrganizationAppsReportService;

  beforeEach(async () => {
    vi.mocked(hasOrganizationBilling).mockReturnValue(true);
    findMany.mockReset();
    getFeatureSettings.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        OrganizationAppsReportService,
        { provide: PrismaService, useValue: { organization: { findMany } } },
        {
          provide: PlatformSettingsService,
          useValue: { getFeatureSettings },
        },
      ],
    }).compile();
    service = module.get(OrganizationAppsReportService);
  });

  it('reports only non-deleted organizations, ordered by label', async () => {
    findMany.mockResolvedValue([]);
    getFeatureSettings.mockResolvedValue({ flags: {} });

    await service.getReport();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { label: 'asc' },
        where: { isDeleted: false },
      }),
    );
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

    const report = await service.getReport();
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

    const [bare] = (await service.getReport()).organizations;

    expect(bare?.subscriptionTier).toBeNull();
    expect(bare?.apps.playground.isVisible).toBe(true);
  });
});
