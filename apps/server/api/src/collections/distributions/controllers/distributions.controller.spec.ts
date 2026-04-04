import { DistributionsController } from '@api/collections/distributions/controllers/distributions.controller';
import {
  DistributionContentType,
  DistributionPlatform,
  PublishStatus,
} from '@genfeedai/enums';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock serializers to avoid real serialization in unit tests
vi.mock('@genfeedai/serializers', () => ({
  DistributionSerializer: {
    opts: {},
    serialize: vi.fn((data) => data),
  },
}));

// Mock response util to return data directly
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

const ORG_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

function createMockUser() {
  return {
    publicMetadata: {
      brand: new Types.ObjectId().toString(),
      organization: ORG_ID,
      user: USER_ID,
    },
  };
}

function createMocks() {
  const distributionsService = {
    cancelScheduled: vi.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      status: PublishStatus.CANCELLED,
    }),
    findByOrganization: vi.fn().mockResolvedValue({
      docs: [],
      total: 0,
    }),
    findOneByOrganization: vi.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      platform: DistributionPlatform.TELEGRAM,
    }),
  };

  const telegramDistributionService = {
    schedule: vi.fn().mockResolvedValue({
      distributionId: new Types.ObjectId().toString(),
    }),
    sendImmediate: vi.fn().mockResolvedValue({
      distributionId: new Types.ObjectId().toString(),
      telegramMessageId: '42',
    }),
  };

  return { distributionsService, telegramDistributionService };
}

describe('DistributionsController', () => {
  let controller: DistributionsController;
  let mocks: ReturnType<typeof createMocks>;

  const mockReq = { originalUrl: '/distributions' } as unknown as Request;

  beforeEach(() => {
    mocks = createMocks();
    controller = new DistributionsController(
      mocks.distributionsService as never,
      mocks.telegramDistributionService as never,
    );
  });

  describe('sendTelegram', () => {
    it('should call sendImmediate with correct params', async () => {
      const user = createMockUser();

      await controller.sendTelegram(
        {
          chatId: '-1001234567890',
          contentType: DistributionContentType.TEXT,
          text: 'Hello',
        },
        user as never,
      );

      expect(
        mocks.telegramDistributionService.sendImmediate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '-1001234567890',
          contentType: DistributionContentType.TEXT,
          organizationId: ORG_ID,
          text: 'Hello',
          userId: USER_ID,
        }),
      );
    });
  });

  describe('scheduleTelegram', () => {
    it('should call schedule with correct params', async () => {
      const user = createMockUser();
      const scheduledAt = new Date(Date.now() + 3600000).toISOString();

      await controller.scheduleTelegram(
        {
          chatId: '-1001234567890',
          contentType: DistributionContentType.TEXT,
          scheduledAt,
          text: 'Scheduled',
        },
        user as never,
      );

      expect(mocks.telegramDistributionService.schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '-1001234567890',
          organizationId: ORG_ID,
          scheduledAt: new Date(scheduledAt),
        }),
      );
    });
  });

  describe('list', () => {
    it('should query with organization and filters', async () => {
      const user = createMockUser();

      await controller.list(
        mockReq,
        { platform: DistributionPlatform.TELEGRAM },
        user as never,
      );

      expect(
        mocks.distributionsService.findByOrganization,
      ).toHaveBeenCalledWith(
        ORG_ID,
        { platform: DistributionPlatform.TELEGRAM, status: undefined },
        1,
        20,
      );
    });
  });

  describe('findOne', () => {
    it('should query with organization isolation', async () => {
      const user = createMockUser();
      const id = new Types.ObjectId().toString();

      await controller.findOne(mockReq, id, user as never);

      expect(
        mocks.distributionsService.findOneByOrganization,
      ).toHaveBeenCalledWith(id, ORG_ID);
    });
  });

  describe('cancel', () => {
    it('should cancel with organization isolation', async () => {
      const user = createMockUser();
      const id = new Types.ObjectId().toString();

      await controller.cancel(mockReq, id, user as never);

      expect(mocks.distributionsService.cancelScheduled).toHaveBeenCalledWith(
        id,
        ORG_ID,
      );
    });
  });
});
