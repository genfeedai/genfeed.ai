import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AdWatchedAdvertisersController } from '@api/collections/ad-watched-advertisers/controllers/ad-watched-advertisers.controller';
import type { AdWatchedAdvertiserDocument } from '@api/collections/ad-watched-advertisers/schemas/ad-watched-advertiser.schema';
import { AdWatchedAdvertisersService } from '@api/collections/ad-watched-advertisers/services/ad-watched-advertisers.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

describe('AdWatchedAdvertisersController identity gates', () => {
  const organizationId = 'org-1';
  const brandId = 'brand-1';

  const controller = new AdWatchedAdvertisersController(
    {} as AdWatchedAdvertisersService,
    {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService,
  );

  describe('canUserModifyEntity', () => {
    it('denies when the caller is brand-scoped but the entity belongs to a different brand', () => {
      const user = { brandId, organizationId } as unknown as User;

      expect(
        controller.canUserModifyEntity(user, {
          brandId: 'brand-2',
          organizationId,
        } as AdWatchedAdvertiserDocument),
      ).toBe(false);
    });

    it('denies when the entity organization is missing and the caller is not a super admin', () => {
      const user = { organizationId } as unknown as User;

      expect(
        controller.canUserModifyEntity(user, {} as AdWatchedAdvertiserDocument),
      ).toBe(false);
    });
  });

  describe('canUserReadEntity', () => {
    it('delegates to canUserModifyEntity', () => {
      const user = { organizationId } as unknown as User;
      const entity = { organizationId } as AdWatchedAdvertiserDocument;

      expect(controller.canUserReadEntity(user, entity)).toBe(
        controller.canUserModifyEntity(user, entity),
      );
    });
  });

  describe('buildFindAllQuery', () => {
    it('fails closed before building a list query when auth has no organization', () => {
      expect(() =>
        controller.buildFindAllQuery({} as User, {} as never),
      ).toThrow(ForbiddenException);
    });

    it('rejects an explicit brandId that is not the authenticated brand', () => {
      const authenticatedBrandId = '550e8400-e29b-41d4-a716-446655440003';
      const foreignBrandId = '550e8400-e29b-41d4-a716-446655440004';
      const user = {
        brandId: authenticatedBrandId,
        organizationId,
      } as unknown as User;

      expect(() =>
        controller.buildFindAllQuery(user, {
          brandId: foreignBrandId,
        } as never),
      ).toThrow(ForbiddenException);
    });

    it('filters by advertiserHandle when provided', () => {
      const user = { organizationId } as unknown as User;

      const result = controller.buildFindAllQuery(user, {
        advertiserHandle: 'nike',
      } as never);

      expect(result.where).toMatchObject({ advertiserHandle: 'nike' });
    });

    it('filters by platform so one ad platform can be listed on its own (#3537)', () => {
      const user = { organizationId } as unknown as User;

      const result = controller.buildFindAllQuery(user, {
        platform: 'meta',
      } as never);

      expect(result.where).toMatchObject({ platform: 'meta' });
    });
  });

  describe('buildFindOneQuery', () => {
    it('fails closed before building a detail query when auth has no organization', () => {
      expect(() =>
        controller.buildFindOneQuery({} as User, 'advertiser-1'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('scoped mutations', () => {
    it('patches through the authenticated tenant and active-brand scope', async () => {
      const sentinel = new Error('stop after persistence call');
      const scopedService = {
        patchScoped: vi.fn().mockRejectedValue(sentinel),
      };
      const scopedController = new AdWatchedAdvertisersController(
        scopedService as unknown as AdWatchedAdvertisersService,
        controller.loggerService,
      );

      await expect(
        scopedController.patch(
          {} as Request,
          { brandId, organizationId } as unknown as User,
          'advertiser-1',
          { advertiserName: 'Updated' },
        ),
      ).rejects.toBe(sentinel);
      expect(scopedService.patchScoped).toHaveBeenCalledWith(
        'advertiser-1',
        { advertiserName: 'Updated' },
        { brandId, organizationId },
      );
    });

    it('soft-deletes through the authenticated tenant scope', async () => {
      const sentinel = new Error('stop after persistence call');
      const scopedService = {
        removeScoped: vi.fn().mockRejectedValue(sentinel),
      };
      const scopedController = new AdWatchedAdvertisersController(
        scopedService as unknown as AdWatchedAdvertisersService,
        controller.loggerService,
      );

      await expect(
        scopedController.remove(
          {} as Request,
          { organizationId } as unknown as User,
          'advertiser-1',
        ),
      ).rejects.toBe(sentinel);
      expect(scopedService.removeScoped).toHaveBeenCalledWith('advertiser-1', {
        organizationId,
      });
    });
  });
});
