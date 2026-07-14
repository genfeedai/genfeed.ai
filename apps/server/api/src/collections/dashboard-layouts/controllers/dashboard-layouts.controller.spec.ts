import { DashboardLayoutsController } from '@api/collections/dashboard-layouts/controllers/dashboard-layouts.controller';
import { UpsertDashboardLayoutDto } from '@api/collections/dashboard-layouts/dto/upsert-dashboard-layout.dto';
import { DashboardLayoutsService } from '@api/collections/dashboard-layouts/services/dashboard-layouts.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getPublicMetadata: vi.fn(() => ({ organization: 'org-1' })),
}));

vi.mock('@genfeedai/serializers', () => ({
  DashboardLayoutSerializer: {
    serialize: vi.fn((data: unknown) => ({ data })),
  },
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((name: string, id: string) => ({
    error: `${name}:${id}`,
  })),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

const mockDashboardLayout = {
  brandId: 'brand-1',
  createdAt: new Date(),
  document: { blocks: [], version: 'genfeed.dashboard.openui.v1' },
  id: 'dl-1',
  isDeleted: false,
  organizationId: 'org-1',
  pageKey: 'workspace-overview',
  updatedAt: new Date(),
  version: 1,
};

const mockRequest = {
  headers: {},
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost'),
};

describe('DashboardLayoutsController', () => {
  let controller: DashboardLayoutsController;
  let service: vi.Mocked<DashboardLayoutsService>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mockService = {
      findForPage: vi.fn(),
      removeScoped: vi.fn(),
      upsertForPage: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardLayoutsController],
      providers: [
        { provide: DashboardLayoutsService, useValue: mockService },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<DashboardLayoutsController>(
      DashboardLayoutsController,
    );
    service = module.get(
      DashboardLayoutsService,
    ) as vi.Mocked<DashboardLayoutsService>;
  });

  describe('findForPage', () => {
    const mockUser = { publicMetadata: { organization: 'org-1' } } as never;

    it('returns serialized layout scoped to the caller organization', async () => {
      service.findForPage.mockResolvedValueOnce(mockDashboardLayout as never);

      const result = await controller.findForPage(
        mockRequest as never,
        mockUser,
        'brand-1',
        'workspace-overview',
      );

      expect(service.findForPage).toHaveBeenCalledWith(
        'brand-1',
        'org-1',
        'workspace-overview',
      );
      expect(result).toBeDefined();
    });

    it('defaults pageKey to workspace-overview when omitted', async () => {
      service.findForPage.mockResolvedValueOnce(mockDashboardLayout as never);

      await controller.findForPage(mockRequest as never, mockUser, 'brand-1');

      expect(service.findForPage).toHaveBeenCalledWith(
        'brand-1',
        'org-1',
        'workspace-overview',
      );
    });

    it('threads the caller organization (not a foreign one) into the service', async () => {
      vi.mocked(getPublicMetadata).mockReturnValueOnce({
        organization: 'org-2',
      } as never);
      service.findForPage.mockResolvedValueOnce(mockDashboardLayout as never);

      await controller.findForPage(mockRequest as never, mockUser, 'brand-1');

      expect(service.findForPage).toHaveBeenCalledWith(
        'brand-1',
        'org-2',
        'workspace-overview',
      );
    });

    it('returns not-found when no layout exists for the page', async () => {
      service.findForPage.mockResolvedValueOnce(null);

      const result = await controller.findForPage(
        mockRequest as never,
        mockUser,
        'brand-1',
      );

      expect(result).toEqual({ error: 'DashboardLayoutsController:brand-1' });
    });

    it.each([
      undefined,
      '',
      '   ',
    ])('returns HTTP 400 when the brand query param is missing or blank (%j)', async (brandId) => {
      const request = controller.findForPage(
        mockRequest as never,
        mockUser,
        brandId as string,
      );

      await expect(request).rejects.toBeInstanceOf(BadRequestException);
      await expect(request).rejects.toMatchObject({ status: 400 });

      expect(service.findForPage).not.toHaveBeenCalled();
    });
  });

  describe('upsert', () => {
    const mockUser = { publicMetadata: { organization: 'org-1' } } as never;

    it('upserts the layout scoped to the caller organization', async () => {
      const dto: UpsertDashboardLayoutDto = {
        brandId: 'brand-1',
        document: { blocks: [] },
        pageKey: 'workspace-overview',
      };
      service.upsertForPage.mockResolvedValueOnce(mockDashboardLayout as never);

      const result = await controller.upsert(
        mockRequest as never,
        mockUser,
        dto,
      );

      expect(service.upsertForPage).toHaveBeenCalledWith('org-1', dto);
      expect(result).toBeDefined();
    });

    it('propagates NotFoundException when the brand is not in the caller org', async () => {
      service.upsertForPage.mockRejectedValueOnce(
        new NotFoundException('Brand', 'brand-1'),
      );

      await expect(
        controller.upsert(mockRequest as never, mockUser, {
          brandId: 'brand-1',
          document: { blocks: [] },
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    const mockUser = { publicMetadata: { organization: 'org-1' } } as never;

    it('removes the layout when owned by the caller organization', async () => {
      service.removeScoped.mockResolvedValueOnce({
        ...mockDashboardLayout,
        isDeleted: true,
      } as never);

      const result = await controller.remove(
        mockRequest as never,
        mockUser,
        'dl-1',
      );

      expect(service.removeScoped).toHaveBeenCalledWith('dl-1', 'org-1');
      expect(result).toBeDefined();
    });

    it('returns not-found when the layout is not owned by the caller organization', async () => {
      service.removeScoped.mockResolvedValueOnce(null);

      const result = await controller.remove(
        mockRequest as never,
        mockUser,
        'dl-1',
      );

      expect(result).toEqual({ error: 'DashboardLayoutsController:dl-1' });
    });
  });
});
