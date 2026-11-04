import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { LinksController } from '@api/collections/links/controllers/links.controller';
import type { CreateLinkDto } from '@api/collections/links/dto/create-link.dto';
import type { LinksQueryDto } from '@api/collections/links/dto/links-query.dto';
import type { UpdateLinkDto } from '@api/collections/links/dto/update-link.dto';
import type { LinksService } from '@api/collections/links/services/links.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

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

// `model Link` has no organization column: a body `brandId` is the only thing
// that decides which brand (and so which public brand page) shows the link.
describe('LinksController brand ownership on write', () => {
  const brandsByOrganization: Record<string, string[]> = {
    'org-1': ['brand-1', 'brand-new'],
    'org-2': ['brand-foreign'],
  };
  const linksService = {
    isBrandInOrganization: (brandId: string, organizationId: string) =>
      Promise.resolve(
        (brandsByOrganization[organizationId] ?? []).includes(brandId),
      ),
    // Matches `model Link`: a brand FK, no organization or user column.
    supportsField: (field: string) => field === 'brandId',
  } as unknown as LinksService;
  const controller = new LinksController(
    linksService,
    {} as unknown as LoggerService,
  );

  it('refuses to move a member link onto another organization brand', async () => {
    await expect(
      controller.enrichUpdateDto(
        { brandId: 'brand-foreign' } as UpdateLinkDto,
        member,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([
    ['another brand of the same organization', { brandId: 'brand-new' }],
    ['no brand change', { label: 'Site' }],
  ])('allows an update with %s', async (_case, body) => {
    await expect(
      controller.enrichUpdateDto(body as UpdateLinkDto, member),
    ).resolves.toEqual(body);
  });

  it('lets a superadmin move a link to any brand', async () => {
    await expect(
      controller.enrichUpdateDto(
        { brandId: 'brand-foreign' } as UpdateLinkDto,
        superAdmin,
      ),
    ).resolves.toEqual({ brandId: 'brand-foreign' });
  });

  it('creates the link on the brand named in the body', () => {
    expect(
      controller.enrichCreateDto(
        { brandId: 'brand-new', label: 'Site' } as CreateLinkDto,
        member,
      ),
    ).toEqual({ brandId: 'brand-new', label: 'Site' });
  });

  it('refuses to create a member link on another organization brand', async () => {
    await expect(
      controller.create({} as Request, member, {
        brandId: 'brand-foreign',
        label: 'Site',
      } as CreateLinkDto),
    ).rejects.toThrow(ForbiddenException);
  });
});
