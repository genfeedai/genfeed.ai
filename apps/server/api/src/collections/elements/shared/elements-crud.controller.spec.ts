import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsStylesController } from '@api/collections/elements/styles/controllers/styles.controller';
import type { ElementsStylesService } from '@api/collections/elements/styles/services/styles.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';

function buildUser(organizationId: string, isSuperAdmin = false) {
  return {
    id: 'user-1',
    isSuperAdmin,
    organizationId,
    userId: 'user-1',
  } as AuthenticatedUser;
}

function buildController() {
  const service = {
    supportsField: vi.fn((field: string) => field === 'organizationId'),
  };

  return new ElementsStylesController(
    service as unknown as ElementsStylesService,
    { log: vi.fn() } as unknown as LoggerService,
  );
}

const dto = { key: 'anime', label: 'Anime' };

describe('ElementsCRUDController platform defaults', () => {
  describe('enrichCreateDto', () => {
    it('creates platform defaults (no organization) for superadmins', () => {
      const enriched = buildController().enrichCreateDto(
        dto,
        buildUser('org-admin', true),
      );

      expect(enriched).toMatchObject({ key: 'anime', organizationId: null });
      expect(enriched).not.toHaveProperty('isPlatformDefault');
    });

    it('lets a superadmin opt into an organization-owned element', () => {
      const enriched = buildController().enrichCreateDto(
        { ...dto, isPlatformDefault: false },
        buildUser('org-admin', true),
      );

      expect(enriched).toMatchObject({ organizationId: 'org-admin' });
    });

    it('pins members to their organization', () => {
      const enriched = buildController().enrichCreateDto(
        { ...dto, organizationId: 'org-2' } as typeof dto,
        buildUser('org-1'),
      );

      expect(enriched).toMatchObject({ organizationId: 'org-1' });
    });

    it('refuses a member creating a platform default', () => {
      expect(() =>
        buildController().enrichCreateDto(
          { ...dto, isPlatformDefault: true },
          buildUser('org-1'),
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('enrichUpdateDto', () => {
    it('never changes ownership', async () => {
      const enriched = await buildController().enrichUpdateDto(
        { isPlatformDefault: true, label: 'Anime 2', organizationId: 'org-2' },
        buildUser('org-1', true),
      );

      expect(enriched).toEqual({ label: 'Anime 2' });
    });
  });

  describe('authorization', () => {
    const controller = buildController();

    it('hides platform defaults from member writes (not-found)', () => {
      expect(
        controller.canUserModifyEntity(buildUser('org-1'), {
          organizationId: null,
        } as never),
      ).toBe(false);
    });

    it('lets members modify only their own elements', () => {
      const member = buildUser('org-1');

      expect(
        controller.canUserModifyEntity(member, {
          organizationId: 'org-1',
        } as never),
      ).toBe(true);
      expect(
        controller.canUserModifyEntity(member, {
          organizationId: 'org-2',
        } as never),
      ).toBe(false);
    });

    it('lets superadmins modify platform defaults', () => {
      expect(
        controller.canUserModifyEntity(buildUser('org-1', true), {
          organizationId: null,
        } as never),
      ).toBe(true);
    });

    it('does not read another organization element', () => {
      expect(
        controller.canUserReadEntity(buildUser('org-1'), {
          organizationId: 'org-2',
        } as never),
      ).toBe(false);
    });
  });

  describe('buildFindAllQuery', () => {
    it('lists active defaults plus own rows for members', () => {
      const query = buildController().buildFindAllQuery(buildUser('org-1'), {});

      expect(query).toMatchObject({
        where: {
          isDeleted: false,
          OR: [
            { isActive: true, organizationId: null },
            { organizationId: 'org-1' },
          ],
        },
      });
    });

    it('includes inactive defaults for superadmins', () => {
      const query = buildController().buildFindAllQuery(
        buildUser('org-1', true),
        {},
      );

      expect(query).toMatchObject({
        where: { OR: [{ organizationId: null }, { organizationId: 'org-1' }] },
      });
    });
  });

  it('flags responses as platform default or organization-owned', () => {
    const controller = buildController();
    const docs = [
      { organizationId: null },
      { organizationId: 'org-1' },
    ] as never[];

    expect(
      controller
        .decorateListForResponse(docs, buildUser('org-1'))
        .map((doc: { isPlatformDefault?: boolean }) => doc.isPlatformDefault),
    ).toEqual([true, false]);
  });
});
