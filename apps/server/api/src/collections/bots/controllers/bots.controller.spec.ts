import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BotsController } from '@api/collections/bots/controllers/bots.controller';
import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { BotsRestreamChatService } from '@api/collections/bots/services/bots-restream-chat.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('BotsController identity gates', () => {
  const organizationId = 'org-1';
  const userId = 'user-1';
  const controller = new BotsController(
    {} as BotsService,
    {} as BotsLivestreamService,
    {} as BotsRestreamChatService,
    {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService,
  );

  const mockUser = {
    organizationId: organizationId,
    userId: userId,
  } as unknown as User;

  describe('canUserModifyEntity', () => {
    it('allows modification when canonical user and organization ids match', () => {
      expect(
        controller.canUserModifyEntity(mockUser, {
          organizationId,
          userId,
        } as BotDocument),
      ).toBe(true);
    });

    it('does not authorize from the legacy organization or user aliases', () => {
      expect(
        controller.canUserModifyEntity(mockUser, {
          organization: organizationId,
          user: userId,
        } as unknown as BotDocument),
      ).toBe(false);
    });

    it('denies when organizationId is missing and user/brand do not match', () => {
      expect(
        controller.canUserModifyEntity(mockUser, {
          userId: 'other-user',
        } as BotDocument),
      ).toBe(false);
    });

    it('denies when caller and entity ids are both missing', () => {
      const emptyUser = {} as unknown as User;

      expect(controller.canUserModifyEntity(emptyUser, {} as BotDocument)).toBe(
        false,
      );
    });
  });

  describe('buildFindAllQuery', () => {
    it('scopes organization listings to organizationId', () => {
      expect(
        controller.buildFindAllQuery(mockUser, {
          scope: 'organization',
        } as never),
      ).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId }),
        }),
      );
    });

    it('fails closed when organization scope has no organization id', () => {
      const emptyUser = {
        organizationId: '',
        userId: userId,
      } as unknown as User;

      expect(() =>
        controller.buildFindAllQuery(emptyUser, {
          scope: 'organization',
        } as never),
      ).toThrow("Bot listing is missing a resolvable 'organization' id");
    });

    it('ignores a foreign organizationId in the query for non-superadmin users', () => {
      expect(
        controller.buildFindAllQuery(mockUser, {
          organizationId: 'org-foreign',
          scope: 'organization',
        } as never),
      ).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId }),
        }),
      );
    });

    it('honors a query organizationId override for superadmin users', () => {
      const superAdmin = {
        ...mockUser,
        isSuperAdmin: true,
      } as unknown as User;

      expect(
        controller.buildFindAllQuery(superAdmin, {
          organizationId: 'org-foreign',
          scope: 'organization',
        } as never),
      ).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-foreign' }),
        }),
      );
    });

    it('always carries the caller organization id when narrowed by brand', () => {
      expect(
        controller.buildFindAllQuery(mockUser, {
          brandId: 'brand-from-another-org',
          scope: 'brand',
        } as never),
      ).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: 'brand-from-another-org',
            organizationId,
          }),
        }),
      );
    });

    it('always carries the caller organization id when narrowed by user', () => {
      expect(
        controller.buildFindAllQuery(mockUser, {
          scope: 'user',
          userId: 'user-from-another-org',
        } as never),
      ).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId,
            userId: 'user-from-another-org',
          }),
        }),
      );
    });

    it('fails closed when brand scope has no resolvable organization id', () => {
      const emptyUser = {
        organizationId: '',
        userId: userId,
      } as unknown as User;

      expect(() =>
        controller.buildFindAllQuery(emptyUser, {
          brandId: 'brand-1',
          scope: 'brand',
        } as never),
      ).toThrow("Bot listing is missing a resolvable 'organization' id");
    });

    it('fails closed when user scope has no resolvable organization id', () => {
      const emptyUser = {
        organizationId: '',
        userId: userId,
      } as unknown as User;

      expect(() =>
        controller.buildFindAllQuery(emptyUser, {
          scope: 'user',
          userId: 'user-1',
        } as never),
      ).toThrow("Bot listing is missing a resolvable 'organization' id");
    });

    it('honors a query organizationId override for superadmin users narrowed by brand', () => {
      const superAdmin = {
        ...mockUser,
        isSuperAdmin: true,
      } as unknown as User;

      expect(
        controller.buildFindAllQuery(superAdmin, {
          brandId: 'brand-1',
          organizationId: 'org-foreign',
          scope: 'brand',
        } as never),
      ).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: 'brand-1',
            organizationId: 'org-foreign',
          }),
        }),
      );
    });
  });
});
