import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { LinksController } from '@api/collections/links/controllers/links.controller';
import type { LinksQueryDto } from '@api/collections/links/dto/links-query.dto';
import { ForbiddenException } from '@nestjs/common';

const member = {
  publicMetadata: {
    brand: 'brand-1',
    organization: 'org-1',
    user: 'user-1',
  },
} as unknown as User;

const superAdmin = {
  publicMetadata: {
    isSuperAdmin: true,
    user: 'admin-1',
  },
} as unknown as User;

describe('LinksController.buildFindAllQuery', () => {
  const controller = {
    buildFindAllQuery: LinksController.prototype.buildFindAllQuery,
  } as unknown as LinksController;

  it('defaults members to their authorized session brand', () => {
    const result = controller.buildFindAllQuery(member, {} as LinksQueryDto);

    expect(result.where).toEqual({
      brand: 'brand-1',
      isDeleted: false,
    });
  });

  it('rejects a foreign brand for members', () => {
    const call = () =>
      controller.buildFindAllQuery(member, {
        brand: 'brand-foreign',
      } as LinksQueryDto);

    expect(call).toThrow(ForbiddenException);
  });

  it('preserves explicit brand filtering for superadmins', () => {
    const result = controller.buildFindAllQuery(superAdmin, {
      brand: 'brand-2',
      organization: 'org-2',
    } as LinksQueryDto);

    expect(result.where).toEqual({
      brand: 'brand-2',
      isDeleted: false,
    });
  });
});
