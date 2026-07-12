import { DashboardLayoutsService } from '@api/collections/dashboard-layouts/services/dashboard-layouts.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { sanitizeLayoutForPersistence } from '@genfeedai/agent/dashboard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/agent/dashboard', () => ({
  sanitizeLayoutForPersistence: vi.fn(),
}));

const sanitizedDocument = {
  blocks: [],
  version: 'genfeed.dashboard.openui.v1',
};

const mockDashboardLayout = {
  brandId: 'brand-1',
  createdAt: new Date(),
  document: sanitizedDocument,
  id: 'dl-1',
  isDeleted: false,
  organizationId: 'org-1',
  pageKey: 'workspace-overview',
  updatedAt: new Date(),
  version: 1,
};

const mockPrisma = {
  brand: {
    findFirst: vi.fn(),
  },
  dashboardLayout: {
    findFirst: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
};

const mockLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

describe('DashboardLayoutsService', () => {
  let service: DashboardLayoutsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(sanitizeLayoutForPersistence).mockReturnValue({
      document: sanitizedDocument,
      issues: [],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardLayoutsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<DashboardLayoutsService>(DashboardLayoutsService);
  });

  describe('findForPage', () => {
    it('scopes the lookup to brand, organization, and page key', async () => {
      mockPrisma.dashboardLayout.findFirst.mockResolvedValueOnce(
        mockDashboardLayout,
      );

      const result = await service.findForPage(
        'brand-1',
        'org-1',
        'workspace-overview',
      );

      // BaseService.findOne runs normalizeDocument, which adds legacy alias
      // fields (organization, brand) on top of the raw row — match a subset.
      expect(result).toMatchObject(mockDashboardLayout);
      expect(mockPrisma.dashboardLayout.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: 'brand-1',
            isDeleted: false,
            organizationId: 'org-1',
            pageKey: 'workspace-overview',
          }),
        }),
      );
    });

    it('returns null when no layout exists for the page', async () => {
      mockPrisma.dashboardLayout.findFirst.mockResolvedValueOnce(null);

      const result = await service.findForPage(
        'brand-1',
        'org-1',
        'workspace-overview',
      );

      expect(result).toBeNull();
    });
  });

  describe('upsertForPage', () => {
    it('upserts the layout scoped to the caller organization', async () => {
      mockPrisma.brand.findFirst.mockResolvedValueOnce({
        organizationId: 'org-1',
      });
      mockPrisma.dashboardLayout.upsert.mockResolvedValueOnce(
        mockDashboardLayout,
      );

      const result = await service.upsertForPage('org-1', {
        brandId: 'brand-1',
        document: { blocks: [] },
        pageKey: 'workspace-overview',
      });

      expect(result).toEqual(mockDashboardLayout);
      expect(mockPrisma.dashboardLayout.upsert).toHaveBeenCalledWith({
        create: {
          brandId: 'brand-1',
          document: sanitizedDocument,
          organizationId: 'org-1',
          pageKey: 'workspace-overview',
        },
        update: {
          document: sanitizedDocument,
          isDeleted: false,
        },
        where: {
          organizationId_brandId_pageKey: {
            brandId: 'brand-1',
            organizationId: 'org-1',
            pageKey: 'workspace-overview',
          },
        },
      });
    });

    it('defaults pageKey to workspace-overview when omitted', async () => {
      mockPrisma.brand.findFirst.mockResolvedValueOnce({
        organizationId: 'org-1',
      });
      mockPrisma.dashboardLayout.upsert.mockResolvedValueOnce(
        mockDashboardLayout,
      );

      await service.upsertForPage('org-1', {
        brandId: 'brand-1',
        document: { blocks: [] },
      });

      expect(mockPrisma.dashboardLayout.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId_brandId_pageKey: {
              brandId: 'brand-1',
              organizationId: 'org-1',
              pageKey: 'workspace-overview',
            },
          },
        }),
      );
    });

    it('scopes the brand lookup to the caller organization', async () => {
      mockPrisma.brand.findFirst.mockResolvedValueOnce({
        organizationId: 'org-1',
      });
      mockPrisma.dashboardLayout.upsert.mockResolvedValueOnce(
        mockDashboardLayout,
      );

      await service.upsertForPage('org-1', {
        brandId: 'brand-1',
        document: { blocks: [] },
        pageKey: 'workspace-overview',
      });

      expect(mockPrisma.brand.findFirst).toHaveBeenCalledWith({
        select: { organizationId: true },
        where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('denies cross-org access: a foreign org cannot upsert another org brand layout', async () => {
      mockPrisma.brand.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.upsertForPage('org-2', {
          brandId: 'brand-1',
          document: { blocks: [] },
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.dashboardLayout.upsert).not.toHaveBeenCalled();
    });

    it('throws ValidationException with the sanitizer issues when the document is invalid', async () => {
      mockPrisma.brand.findFirst.mockResolvedValueOnce({
        organizationId: 'org-1',
      });
      vi.mocked(sanitizeLayoutForPersistence).mockReturnValueOnce({
        document: sanitizedDocument,
        issues: [
          { code: 'invalid_props', message: 'bad block', path: 'blocks[0]' },
        ],
      });

      await expect(
        service.upsertForPage('org-1', {
          brandId: 'brand-1',
          document: { blocks: ['not-a-block'] },
        }),
      ).rejects.toThrow(ValidationException);

      expect(mockPrisma.dashboardLayout.upsert).not.toHaveBeenCalled();
    });
  });

  describe('removeScoped', () => {
    it('returns null when the layout is not owned by the caller organization', async () => {
      mockPrisma.dashboardLayout.findFirst.mockResolvedValueOnce(null);

      const result = await service.removeScoped('dl-1', 'org-2');

      expect(result).toBeNull();
      expect(mockPrisma.dashboardLayout.update).not.toHaveBeenCalled();
    });

    it('soft-deletes the layout when owned by the caller organization', async () => {
      mockPrisma.dashboardLayout.findFirst.mockResolvedValueOnce(
        mockDashboardLayout,
      );
      mockPrisma.dashboardLayout.update.mockResolvedValueOnce({
        ...mockDashboardLayout,
        isDeleted: true,
      });

      const result = await service.removeScoped('dl-1', 'org-1');

      // remove() normalizes the returned row (adds alias fields) — match subset.
      expect(result).toMatchObject({ ...mockDashboardLayout, isDeleted: true });
      expect(mockPrisma.dashboardLayout.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'dl-1',
            isDeleted: false,
            organizationId: 'org-1',
          }),
        }),
      );
      expect(mockPrisma.dashboardLayout.update).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: { id: 'dl-1' },
      });
    });
  });
});
