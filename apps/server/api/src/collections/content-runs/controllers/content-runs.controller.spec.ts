import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import type { User } from '@clerk/backend';
import { ContentRunStatus } from '@genfeedai/enums';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(),
}));

const mockGetPublicMetadata = getPublicMetadata as unknown as ReturnType<
  typeof vi.fn
>;

describe('ContentRunsController', () => {
  let controller: ContentRunsController;

  const mockService = {
    getRunById: vi.fn(),
    listByBrand: vi.fn(),
  };

  const mockReq = { headers: {}, url: '/' } as unknown as Request;
  const mockUser = {} as User;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockGetPublicMetadata.mockReturnValue({
      organization: 'org-1',
      user: 'user-1',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentRunsController],
      providers: [
        {
          provide: ContentRunsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ContentRunsController);
  });

  it('does not declare a controller-level v1 prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ContentRunsController)).not.toBe(
      'v1',
    );
  });

  describe('listBrandRuns', () => {
    it('lists runs scoped to org and brand', async () => {
      mockService.listByBrand.mockResolvedValue([]);

      await controller.listBrandRuns(
        mockReq,
        'brand-1',
        mockUser,
        undefined,
        undefined,
      );

      expect(mockService.listByBrand).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        undefined,
        undefined,
      );
    });

    it('passes skillSlug filter', async () => {
      mockService.listByBrand.mockResolvedValue([]);

      await controller.listBrandRuns(
        mockReq,
        'brand-1',
        mockUser,
        'content-writing',
        undefined,
      );

      expect(mockService.listByBrand).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'content-writing',
        undefined,
      );
    });

    it('passes status filter', async () => {
      mockService.listByBrand.mockResolvedValue([]);

      await controller.listBrandRuns(
        mockReq,
        'brand-1',
        mockUser,
        undefined,
        ContentRunStatus.COMPLETED,
      );

      expect(mockService.listByBrand).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        undefined,
        ContentRunStatus.COMPLETED,
      );
    });

    it('passes both skillSlug and status filters', async () => {
      mockService.listByBrand.mockResolvedValue([]);

      await controller.listBrandRuns(
        mockReq,
        'brand-1',
        mockUser,
        'image-gen',
        ContentRunStatus.FAILED,
      );

      expect(mockService.listByBrand).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'image-gen',
        ContentRunStatus.FAILED,
      );
    });
  });

  describe('getRun', () => {
    it('gets a run by id scoped to org', async () => {
      mockService.getRunById.mockResolvedValue({
        _id: 'run-1',
        status: 'completed',
      });

      await controller.getRun(mockReq, 'run-1', mockUser);

      expect(mockService.getRunById).toHaveBeenCalledWith('org-1', 'run-1');
    });

    it('uses organization from user metadata', async () => {
      mockGetPublicMetadata.mockReturnValue({
        organization: 'org-different',
      });
      mockService.getRunById.mockResolvedValue({ _id: 'run-1' });

      await controller.getRun(mockReq, 'run-1', mockUser);

      expect(mockService.getRunById).toHaveBeenCalledWith(
        'org-different',
        'run-1',
      );
    });

    it('returns null when run not found', async () => {
      mockService.getRunById.mockResolvedValue(null);

      await controller.getRun(mockReq, 'nonexistent', mockUser);

      expect(mockService.getRunById).toHaveBeenCalledWith(
        'org-1',
        'nonexistent',
      );
    });

    it('propagates service errors', async () => {
      mockService.getRunById.mockRejectedValue(new Error('DB error'));

      await expect(
        controller.getRun(mockReq, 'run-1', mockUser),
      ).rejects.toThrow('DB error');
    });
  });
});
