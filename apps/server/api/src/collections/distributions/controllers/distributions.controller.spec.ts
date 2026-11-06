import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { DistributionsController } from '@api/collections/distributions/controllers/distributions.controller';
import type { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { TelegramDistributionService } from '@api/services/distribution/telegram/telegram-distribution.service';
import {
  DistributionContentType,
  DistributionPlatform,
  PublishStatus,
} from '@genfeedai/contracts';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The response layer is out of scope: hand back what the controller read.
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: (_req: unknown, _serializer: unknown, data: unknown) =>
    data,
  serializeSingle: (_req: unknown, _serializer: unknown, data: unknown) => data,
}));

interface Distribution {
  chatId?: string;
  id: string;
  organizationId: string;
  platform: DistributionPlatform;
  scheduledAt?: Date;
  status: PublishStatus;
  text?: string;
  userId?: string;
}

const user = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as unknown as User;
const req = { originalUrl: '/distributions' } as unknown as Request;
const message = {
  chatId: '-1001234567890',
  contentType: DistributionContentType.TEXT,
  platform: DistributionPlatform.TELEGRAM,
};

describe('DistributionsController', () => {
  let controller: DistributionsController;
  let distributions: Map<string, Distribution>;

  const seed = (row: Distribution) => distributions.set(row.id, row);

  beforeEach(() => {
    distributions = new Map();
    const record = (
      options: Omit<Distribution, 'id' | 'platform' | 'status'>,
      status: PublishStatus,
    ) => {
      const row = {
        ...options,
        id: `distribution-${distributions.size + 1}`,
        platform: DistributionPlatform.TELEGRAM,
        status,
      };
      distributions.set(row.id, row);
      return { distributionId: row.id };
    };
    const ownRow = (id: string, organizationId: string) => {
      const row = distributions.get(id);
      return row?.organizationId === organizationId ? row : null;
    };

    const distributionsService = {
      cancelScheduled: async (id: string, organizationId: string) => {
        const row = ownRow(id, organizationId);
        if (row?.status !== PublishStatus.SCHEDULED) {
          throw new NotFoundException('Scheduled distribution');
        }
        row.status = PublishStatus.CANCELLED;
        return row;
      },
      findByOrganization: async (
        organizationId: string,
        filters: { platform?: DistributionPlatform; status?: PublishStatus },
        page: number,
        limit: number,
      ) => {
        const docs = [...distributions.values()].filter(
          (row) =>
            row.organizationId === organizationId &&
            (!filters.platform || row.platform === filters.platform) &&
            (!filters.status || row.status === filters.status),
        );
        return {
          docs: docs.slice((page - 1) * limit, page * limit),
          total: docs.length,
        };
      },
      findOneByOrganization: async (id: string, organizationId: string) =>
        ownRow(id, organizationId),
    };
    const telegram = {
      schedule: async (
        options: Omit<Distribution, 'id' | 'platform' | 'status'>,
      ) => record(options, PublishStatus.SCHEDULED),
      sendImmediate: async (
        options: Omit<Distribution, 'id' | 'platform' | 'status'>,
      ) => ({
        ...record(options, PublishStatus.PUBLISHED),
        telegramMessageId: '42',
      }),
    };

    controller = new DistributionsController(
      distributionsService as unknown as DistributionsService,
      telegram as unknown as TelegramDistributionService,
    );
  });

  describe('create', () => {
    it('sends at once in the caller organization when scheduledAt is absent', async () => {
      await expect(
        controller.create({ ...message, text: 'Hello' }, user),
      ).resolves.toEqual({
        distributionId: 'distribution-1',
        telegramMessageId: '42',
      });
      expect(distributions.get('distribution-1')).toMatchObject({
        chatId: '-1001234567890',
        organizationId: 'org-1',
        status: PublishStatus.PUBLISHED,
        text: 'Hello',
        userId: 'user-1',
      });
    });

    it('schedules the send when scheduledAt is present', async () => {
      const scheduledAt = '2026-11-07T09:00:00.000Z';

      await controller.create(
        { ...message, scheduledAt, text: 'Scheduled' },
        user,
      );

      expect(distributions.get('distribution-1')).toMatchObject({
        organizationId: 'org-1',
        scheduledAt: new Date(scheduledAt),
        status: PublishStatus.SCHEDULED,
        userId: 'user-1',
      });
    });

    it('rejects an unsupported platform without sending', async () => {
      await expect(
        controller.create(
          {
            ...message,
            platform: 'unsupported' as DistributionPlatform,
            text: 'Nope',
          },
          user,
        ),
      ).rejects.toThrow('Unsupported distribution platform');
      expect(distributions.size).toBe(0);
    });
  });

  describe('reads', () => {
    beforeEach(() => {
      seed({
        id: 'mine',
        organizationId: 'org-1',
        platform: DistributionPlatform.TELEGRAM,
        status: PublishStatus.PUBLISHED,
      });
      seed({
        id: 'foreign',
        organizationId: 'org-2',
        platform: DistributionPlatform.TELEGRAM,
        status: PublishStatus.SCHEDULED,
      });
    });

    it('lists only the caller organization distributions', async () => {
      await expect(
        controller.list(req, { platform: DistributionPlatform.TELEGRAM }, user),
      ).resolves.toEqual({ docs: [distributions.get('mine')], total: 1 });
    });

    it('finds its own distribution', async () => {
      await expect(controller.findOne(req, 'mine', user)).resolves.toBe(
        distributions.get('mine'),
      );
    });

    it('finds nothing for another organization distribution', async () => {
      await expect(
        controller.findOne(req, 'foreign', user),
      ).resolves.toBeNull();
    });
  });

  describe('cancel', () => {
    it('cancels a scheduled distribution of the caller organization', async () => {
      seed({
        id: 'mine',
        organizationId: 'org-1',
        platform: DistributionPlatform.TELEGRAM,
        status: PublishStatus.SCHEDULED,
      });

      await controller.cancel(req, 'mine', user);

      expect(distributions.get('mine')?.status).toBe(PublishStatus.CANCELLED);
    });

    it('leaves another organization scheduled distribution untouched', async () => {
      seed({
        id: 'foreign',
        organizationId: 'org-2',
        platform: DistributionPlatform.TELEGRAM,
        status: PublishStatus.SCHEDULED,
      });

      await expect(controller.cancel(req, 'foreign', user)).rejects.toThrow(
        NotFoundException,
      );
      expect(distributions.get('foreign')?.status).toBe(
        PublishStatus.SCHEDULED,
      );
    });
  });
});
