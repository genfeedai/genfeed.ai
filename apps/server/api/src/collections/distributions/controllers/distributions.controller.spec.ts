import { DistributionsController } from '@api/collections/distributions/controllers/distributions.controller';
import {
  DistributionContentType,
  DistributionPlatform,
  PublishStatus,
} from '@genfeedai/enums';
import type { Request } from 'express';
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

const ORG_ID = '507f191e810c19729de860ee'.toString();
const USER_ID = '507f191e810c19729de860ee'.toString();

function createMockUser() {
  return {
    publicMetadata: {
      brand: '507f191e810c19729de860ee'.toString(),
      organization: ORG_ID,
      user: USER_ID,
    },
  };
}

function createMocks() {
  const distributionsService = {
    cancelScheduled: vi.fn().mockResolvedValue({
      _id: '507f191e810c19729de860ee',
      status: PublishStatus.CANCELLED,
    }),
    createFromRequest: vi.fn().mockResolvedValue({
      distributionId: '507f191e810c19729de860ee'.toString(),
      telegramMessageId: '42',
    }),
    findByOrganization: vi.fn().mockResolvedValue({
      docs: [],
      total: 0,
    }),
    findOneByOrganization: vi.fn().mockResolvedValue({
      _id: '507f191e810c19729de860ee',
      platform: DistributionPlatform.TELEGRAM,
    }),
  };

  return { distributionsService };
}

describe('DistributionsController', () => {
  let controller: DistributionsController;
  let mocks: ReturnType<typeof createMocks>;

  const mockReq = { originalUrl: '/distributions' } as unknown as Request;

  beforeEach(() => {
    mocks = createMocks();
    controller = new DistributionsController(
      mocks.distributionsService as never,
    );
  });

  describe('create', () => {
    it('should dispatch immediate send when scheduledAt is absent', async () => {
      const user = createMockUser();

      await controller.create(
        {
          chatId: '-1001234567890',
          contentType: DistributionContentType.TEXT,
          platform: DistributionPlatform.TELEGRAM,
          text: 'Hello',
        },
        user as never,
      );

      expect(mocks.distributionsService.createFromRequest).toHaveBeenCalledWith(
        ORG_ID,
        USER_ID,
        expect.objectContaining({
          chatId: '-1001234567890',
          contentType: DistributionContentType.TEXT,
          platform: DistributionPlatform.TELEGRAM,
          text: 'Hello',
        }),
      );
    });

    it('should dispatch scheduled send when scheduledAt is present', async () => {
      const user = createMockUser();
      const scheduledAt = new Date(Date.now() + 3600000).toISOString();

      await controller.create(
        {
          chatId: '-1001234567890',
          contentType: DistributionContentType.TEXT,
          platform: DistributionPlatform.TELEGRAM,
          scheduledAt,
          text: 'Scheduled',
        },
        user as never,
      );

      expect(mocks.distributionsService.createFromRequest).toHaveBeenCalledWith(
        ORG_ID,
        USER_ID,
        expect.objectContaining({
          chatId: '-1001234567890',
          platform: DistributionPlatform.TELEGRAM,
          scheduledAt,
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
      const id = '507f191e810c19729de860ee'.toString();

      await controller.findOne(mockReq, id, user as never);

      expect(
        mocks.distributionsService.findOneByOrganization,
      ).toHaveBeenCalledWith(id, ORG_ID);
    });
  });

  describe('cancel', () => {
    it('should cancel with organization isolation', async () => {
      const user = createMockUser();
      const id = '507f191e810c19729de860ee'.toString();

      await controller.cancel(mockReq, id, user as never);

      expect(mocks.distributionsService.cancelScheduled).toHaveBeenCalledWith(
        id,
        ORG_ID,
      );
    });
  });
});
