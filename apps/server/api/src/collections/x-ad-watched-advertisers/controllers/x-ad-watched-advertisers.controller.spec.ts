import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { XAdWatchedAdvertisersController } from '@api/collections/x-ad-watched-advertisers/controllers/x-ad-watched-advertisers.controller';
import type { XAdWatchedAdvertiserDocument } from '@api/collections/x-ad-watched-advertisers/schemas/x-ad-watched-advertiser.schema';
import { XAdWatchedAdvertisersService } from '@api/collections/x-ad-watched-advertisers/services/x-ad-watched-advertisers.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

describe('XAdWatchedAdvertisersController identity gates', () => {
  const organizationId = 'org-1';
  const brandId = 'brand-1';

  const controller = new XAdWatchedAdvertisersController(
    {} as XAdWatchedAdvertisersService,
    {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService,
  );

  describe('canUserModifyEntity', () => {
    it('allows when the entity organization matches and the caller has no brand restriction', () => {
      const user = { organizationId } as unknown as User;

      expect(
        controller.canUserModifyEntity(user, {
          organizationId,
        } as XAdWatchedAdvertiserDocument),
      ).toBe(true);
    });

    it('allows when the entity organization and brand both match the caller', () => {
      const user = { brandId, organizationId } as unknown as User;

      expect(
        controller.canUserModifyEntity(user, {
          brandId,
          organizationId,
        } as XAdWatchedAdvertiserDocument),
      ).toBe(true);
    });

    it('denies when the caller is brand-scoped but the entity belongs to a different brand', () => {
      const user = { brandId, organizationId } as unknown as User;

      expect(
        controller.canUserModifyEntity(user, {
          brandId: 'brand-2',
          organizationId,
        } as XAdWatchedAdvertiserDocument),
      ).toBe(false);
    });

    it('denies when the entity organization does not match the caller', () => {
      const user = { organizationId } as unknown as User;

      expect(
        controller.canUserModifyEntity(user, {
          organizationId: 'org-2',
        } as XAdWatchedAdvertiserDocument),
      ).toBe(false);
    });

    it('denies when the entity organization is missing and the caller is not a super admin', () => {
      const user = { organizationId } as unknown as User;

      expect(
        controller.canUserModifyEntity(
          user,
          {} as XAdWatchedAdvertiserDocument,
        ),
      ).toBe(false);
    });

    it('allows a super admin even when organizations do not match', () => {
      const user = { isSuperAdmin: true, organizationId } as unknown as User;

      expect(
        controller.canUserModifyEntity(user, {
          organizationId: 'org-2',
        } as XAdWatchedAdvertiserDocument),
      ).toBe(true);
    });
  });

  describe('canUserReadEntity', () => {
    it('delegates to canUserModifyEntity', () => {
      const user = { organizationId } as unknown as User;
      const entity = { organizationId } as XAdWatchedAdvertiserDocument;

      expect(controller.canUserReadEntity(user, entity)).toBe(
        controller.canUserModifyEntity(user, entity),
      );
    });

    it('denies a mismatched organization the same as canUserModifyEntity', () => {
      const user = { organizationId } as unknown as User;
      const entity = {
        organizationId: 'org-2',
      } as XAdWatchedAdvertiserDocument;

      expect(controller.canUserReadEntity(user, entity)).toBe(false);
    });
  });

  describe('buildFindAllQuery', () => {
    it('scopes to the caller organization by default, excluding soft-deleted rows', () => {
      const user = { organizationId } as unknown as User;

      const result = controller.buildFindAllQuery(user, {} as never);

      expect(result.where).toEqual({ isDeleted: false, organizationId });
    });

    it('fails closed before building a list query when auth has no organization', () => {
      expect(() =>
        controller.buildFindAllQuery({} as User, {} as never),
      ).toThrow(ForbiddenException);
    });

    it('ignores an organizationId query override and keeps the authenticated tenant scope', () => {
      const user = { organizationId } as unknown as User;

      const result = controller.buildFindAllQuery(user, {
        organizationId: 'org-override',
      } as never);

      expect(result.where).toMatchObject({ organizationId });
    });

    it('falls back to the caller brand when the query has none', () => {
      const user = { brandId, organizationId } as unknown as User;

      const result = controller.buildFindAllQuery(user, {} as never);

      expect(result.where).toMatchObject({ brandId });
    });

    it('honors an explicit brandId query filter', () => {
      const user = { organizationId } as unknown as User;

      const result = controller.buildFindAllQuery(user, {
        brandId: 'brand-override',
      } as never);

      expect(result.where).toMatchObject({ brandId: 'brand-override' });
    });

    it('filters by advertiserHandle when provided', () => {
      const user = { organizationId } as unknown as User;

      const result = controller.buildFindAllQuery(user, {
        advertiserHandle: 'nike',
      } as never);

      expect(result.where).toMatchObject({ advertiserHandle: 'nike' });
    });

    it('honors an explicit isDeleted query override', () => {
      const user = { organizationId } as unknown as User;

      const result = controller.buildFindAllQuery(user, {
        isDeleted: true,
      } as never);

      expect(result.where).toMatchObject({ isDeleted: true });
    });
  });

  describe('buildFindOneQuery', () => {
    it('scopes the lookup to the caller organization and active rows', () => {
      const user = { organizationId } as unknown as User;

      expect(controller.buildFindOneQuery(user, 'advertiser-1')).toEqual({
        id: 'advertiser-1',
        isDeleted: false,
        organizationId,
      });
    });

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
      const scopedController = new XAdWatchedAdvertisersController(
        scopedService as unknown as XAdWatchedAdvertisersService,
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
      const scopedController = new XAdWatchedAdvertisersController(
        scopedService as unknown as XAdWatchedAdvertisersService,
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
