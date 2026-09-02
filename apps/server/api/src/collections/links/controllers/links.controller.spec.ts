import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { LinksController } from '@api/collections/links/controllers/links.controller';
import type { LinksQueryDto } from '@api/collections/links/dto/links-query.dto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

const member = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as unknown as User;

const superAdmin = {
  isSuperAdmin: true,
  userId: 'admin-1',
} as unknown as User;

describe('LinksController.buildFindAllQuery', () => {
  const controller = {
    buildFindAllQuery: LinksController.prototype.buildFindAllQuery,
  } as unknown as LinksController;

  it('defaults members to their authorized session brand', () => {
    const result = controller.buildFindAllQuery(member, {} as LinksQueryDto);

    expect(result.where).toEqual({
      brandId: 'brand-1',
      isDeleted: false,
    });
  });

  it('rejects a foreign brand for members', () => {
    const call = () =>
      controller.buildFindAllQuery(member, {
        brandId: 'brand-foreign',
      } as LinksQueryDto);

    expect(call).toThrow(ForbiddenException);
  });

  it('preserves explicit brand filtering for superadmins', () => {
    const result = controller.buildFindAllQuery(superAdmin, {
      brandId: 'brand-2',
      organizationId: 'org-2',
    } as LinksQueryDto);

    expect(result.where).toEqual({
      brandId: 'brand-2',
      isDeleted: false,
    });
  });

  // `GET /links?brandId=<id>` must reach Prisma as the scalar FK.
  it('preserves an explicit `?brandId=` filter', () => {
    const result = controller.buildFindAllQuery(member, {
      brandId: 'brand-1',
    } as LinksQueryDto);

    expect(result.where).toEqual({
      brandId: 'brand-1',
      isDeleted: false,
    });
    expect(result.where).not.toHaveProperty('brand');
  });

  it('keeps `?isDeleted=true` alongside the scalar brand filter', () => {
    const result = controller.buildFindAllQuery(member, {
      isDeleted: true,
    } as LinksQueryDto);

    expect(result.where).toEqual({
      brandId: 'brand-1',
      isDeleted: true,
    });
  });

  // Links have no `organizationId`; brand is the only tenancy boundary. A
  // missing brand id used to serialize as `where.brand = undefined`, which
  // `normalizeWhere` drops — returning every link across every brand.
  it('fails closed when a superadmin resolves no brand at all', () => {
    const call = () =>
      controller.buildFindAllQuery(superAdmin, {} as LinksQueryDto);

    expect(call).toThrow(BadRequestException);
  });
});
