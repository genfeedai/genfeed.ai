import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ContentDraftsController } from '@api/collections/content-drafts/controllers/content-drafts.controller';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ContentDraftStatus } from '@genfeedai/enums';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  extractRequestContext: vi.fn().mockReturnValue({
    organizationId: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439011',
  }),
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  }),
}));

describe('ContentDraftsController', () => {
  let controller: ContentDraftsController;
  let service: {
    bulkApprove: ReturnType<typeof vi.fn>;
    listByBrand: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockReq = { headers: {}, url: '/content-drafts' } as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentDraftsController],
      providers: [
        {
          provide: ContentDraftsService,
          useValue: {
            bulkApprove: vi.fn().mockResolvedValue({ modifiedCount: 2 }),
            listByBrand: vi.fn().mockResolvedValue([]),
            update: vi
              .fn()
              .mockResolvedValue({ _id: 'draft-1', status: 'approved' }),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ContentDraftsController);
    service = module.get(ContentDraftsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listDrafts', () => {
    it('lists drafts scoped to org and brand', async () => {
      await controller.listDrafts(mockReq, mockUser, 'brand-1', {
        status: undefined,
      } as never);

      expect(service.listByBrand).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'brand-1',
        undefined,
      );
    });

    it('passes status filter when provided', async () => {
      await controller.listDrafts(mockReq, mockUser, 'brand-1', {
        status: 'pending',
      } as never);

      expect(service.listByBrand).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'brand-1',
        'pending',
      );
    });
  });

  describe('updateDraft', () => {
    it('approves a draft with user context', async () => {
      await controller.updateDraft(mockReq, mockUser, 'draft-1', {
        status: ContentDraftStatus.APPROVED,
      });

      expect(service.update).toHaveBeenCalledWith(
        'draft-1',
        '507f1f77bcf86cd799439012',
        { status: ContentDraftStatus.APPROVED },
        '507f1f77bcf86cd799439011',
      );
    });

    it('rejects a draft with reason', async () => {
      await controller.updateDraft(mockReq, mockUser, 'draft-1', {
        reason: 'Off-brand',
        status: ContentDraftStatus.REJECTED,
      });

      expect(service.update).toHaveBeenCalledWith(
        'draft-1',
        '507f1f77bcf86cd799439012',
        { reason: 'Off-brand', status: ContentDraftStatus.REJECTED },
        '507f1f77bcf86cd799439011',
      );
    });

    it('edits draft content', async () => {
      await controller.updateDraft(mockReq, mockUser, 'draft-1', {
        content: 'Updated caption',
      });

      expect(service.update).toHaveBeenCalledWith(
        'draft-1',
        '507f1f77bcf86cd799439012',
        { content: 'Updated caption' },
        '507f1f77bcf86cd799439011',
      );
    });

    it('propagates NotFoundException when draft not found', async () => {
      service.update.mockRejectedValue(
        new NotFoundException('ContentDraft', 'bad-id'),
      );

      await expect(
        controller.updateDraft(mockReq, mockUser, 'bad-id', {
          status: ContentDraftStatus.APPROVED,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkApprove', () => {
    it('bulk approves multiple drafts', async () => {
      await controller.bulkApprove(mockUser, {
        ids: ['draft-1', 'draft-2'],
      });

      expect(service.bulkApprove).toHaveBeenCalledWith(
        ['draft-1', 'draft-2'],
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439011',
      );
    });

    it('handles empty ids array', async () => {
      service.bulkApprove.mockResolvedValue({ modifiedCount: 0 });

      const result = await controller.bulkApprove(mockUser, { ids: [] });

      expect(service.bulkApprove).toHaveBeenCalledWith(
        [],
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439011',
      );
      expect(result).toEqual({ modifiedCount: 0 });
    });
  });
});
