import { ContentDraftsController } from '@api/collections/content-drafts/controllers/content-drafts.controller';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
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
    approve: ReturnType<typeof vi.fn>;
    bulkApprove: ReturnType<typeof vi.fn>;
    editDraft: ReturnType<typeof vi.fn>;
    listByBrand: ReturnType<typeof vi.fn>;
    reject: ReturnType<typeof vi.fn>;
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
            approve: vi
              .fn()
              .mockResolvedValue({ _id: 'draft-1', status: 'approved' }),
            bulkApprove: vi.fn().mockResolvedValue({ modifiedCount: 2 }),
            editDraft: vi
              .fn()
              .mockResolvedValue({ _id: 'draft-1', content: 'edited' }),
            listByBrand: vi.fn().mockResolvedValue([]),
            reject: vi
              .fn()
              .mockResolvedValue({ _id: 'draft-1', status: 'rejected' }),
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

  describe('approveDraft', () => {
    it('approves a draft with user context', async () => {
      await controller.approveDraft(mockReq, mockUser, 'draft-1');

      expect(service.approve).toHaveBeenCalledWith(
        'draft-1',
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439011',
      );
    });

    it('propagates NotFoundException when draft not found', async () => {
      service.approve.mockRejectedValue(
        new NotFoundException('ContentDraft', 'bad-id'),
      );

      await expect(
        controller.approveDraft(mockReq, mockUser, 'bad-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectDraft', () => {
    it('rejects a draft with reason', async () => {
      await controller.rejectDraft(mockReq, mockUser, 'draft-1', {
        reason: 'Off-brand',
      });

      expect(service.reject).toHaveBeenCalledWith(
        'draft-1',
        '507f1f77bcf86cd799439012',
        'Off-brand',
      );
    });

    it('propagates NotFoundException when draft not found', async () => {
      service.reject.mockRejectedValue(
        new NotFoundException('ContentDraft', 'bad-id'),
      );

      await expect(
        controller.rejectDraft(mockReq, mockUser, 'bad-id', {
          reason: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('editDraft', () => {
    it('edits draft content', async () => {
      await controller.editDraft(mockReq, mockUser, 'draft-1', {
        content: 'Updated caption',
      });

      expect(service.editDraft).toHaveBeenCalledWith(
        'draft-1',
        '507f1f77bcf86cd799439012',
        'Updated caption',
      );
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
