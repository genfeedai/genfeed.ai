import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { MembersController } from '@api/collections/members/controllers/members.controller';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import {
  adminUser,
  emptyPage,
  fieldValues,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetOrganizationId,
  tenantReadQuery,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { MemberRole } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';

const rosterRuntime = vi.hoisted(() => ({ cloud: false }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => rosterRuntime.cloud,
}));
beforeEach(() => {
  rosterRuntime.cloud = false;
});

describe('MembersController tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const controller = Object.create(
      MembersController.prototype,
    ) as MembersController;
    Object.assign(controller, {
      membersService: { findAll: mock },
      brandAccessService: brandAccessFixture(),
      loggerService: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = tenantReadQuery(BaseQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await controller.findAll(query, request, user);
    const read = mock.mock.calls[0]?.[0];
    expect(fieldValues(read, 'organizationId')).toContain(targetOrganizationId);
    expect(fieldValues(read, 'organizationId')).not.toContain(
      sessionOrganizationId,
    );
    expect(fieldValues(read, 'isDeleted')).not.toContain(true);
    expect(fieldValues(read, 'brandId')).not.toContain(sessionBrandId);
  });

  it('rejects a member foreign organization before reading', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(BaseQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await expect(controller.findAll(query, request, user)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('keeps the session organization for a member without an override', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(BaseQueryDto, {});
    const request = tenantReadRequest(user);
    await controller.findAll(query, request, user);
    expect(fieldValues(mock.mock.calls[0]?.[0], 'organizationId')).toContain(
      sessionOrganizationId,
    );
    expect(
      fieldValues(mock.mock.calls[0]?.[0], 'organizationId'),
    ).not.toContain(targetOrganizationId);
    expect(fieldValues(mock.mock.calls[0]?.[0], 'isDeleted')).not.toContain(
      true,
    );
  });

  it('reauthorizes organization reads instead of returning a cached roster', async () => {
    expect(
      Reflect.getMetadata('cache', MembersController.prototype.findAll),
    ).toBeUndefined();
    const { controller, mock } = setup();
    await controller.findAll(
      tenantReadQuery(BaseQueryDto, {}),
      tenantReadRequest(memberUser),
      memberUser,
    );
    await controller.findAll(
      tenantReadQuery(BaseQueryDto, { organizationId: targetOrganizationId }),
      tenantReadRequest(adminUser, { organizationId: targetOrganizationId }),
      adminUser,
    );
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1][0].include.brands.where.organizationId).toBe(
      targetOrganizationId,
    );
  });
});

describe('roster live brand relation authorization', () => {
  function setup() {
    rosterRuntime.cloud = true;
    const member = {
      role: { key: MemberRole.USER },
      roleKey: MemberRole.OWNER,
      brands: [{ id: sessionBrandId }],
    };
    const findMember = vi.fn().mockImplementation(async () => member);
    const findAll = vi.fn().mockImplementation(async () => {
      expect(findMember).toHaveBeenCalled();
      return emptyPage();
    });
    const policy = new BrandAccessService({
      member: { findFirst: findMember },
    } as unknown as PrismaService);
    const controller = Object.create(
      MembersController.prototype,
    ) as MembersController;
    Object.assign(controller, {
      membersService: { findAll },
      brandAccessService: policy,
      loggerService: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    return { controller, member, findMember, findAll };
  }

  it('filters included brands by the viewer before executing the roster query', async () => {
    const f = setup();
    await f.controller.findAll(
      tenantReadQuery(BaseQueryDto, {}),
      tenantReadRequest(memberUser),
      memberUser,
    );
    const query = f.findAll.mock.calls[0][0];
    expect(query.include.brands).toEqual({
      select: { id: true, label: true, slug: true },
      where: {
        organizationId: sessionOrganizationId,
        isDeleted: false,
        id: { in: [sessionBrandId] },
      },
    });
    expect(query.include.user.select).not.toHaveProperty('platformRole');
    expect(query.include.user.select).not.toHaveProperty('settings');
    expect(fieldValues(query.where, 'organizationId')).toContain(
      sessionOrganizationId,
    );
    expect(f.findMember).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: memberUser.userId,
          organizationId: sessionOrganizationId,
          isActive: true,
          isDeleted: false,
          organization: { is: { isDeleted: false } },
          role: { is: { isDeleted: false } },
        }),
      }),
    );
  });

  it('immediately narrows included relations after assignment revocation with the same request', async () => {
    const f = setup();
    const query = tenantReadQuery(BaseQueryDto, {});
    const request = tenantReadRequest(memberUser);
    await f.controller.findAll(query, request, memberUser);
    f.member.brands = [];
    await f.controller.findAll(query, request, memberUser);
    expect(f.findAll.mock.calls[1][0].include.brands.where.id).toEqual({
      in: [],
    });
    expect(f.findMember).toHaveBeenCalledTimes(2);
  });

  it('uses canonical privilege and preserves the API-key cap on roster brand relations', async () => {
    const f = setup();
    f.member.role.key = MemberRole.OWNER;
    const query = tenantReadQuery(BaseQueryDto, {});
    await f.controller.findAll(
      query,
      tenantReadRequest(memberUser),
      memberUser,
    );
    expect(f.findAll.mock.calls[0][0].include.brands.where).not.toHaveProperty(
      'id',
    );
    const capped = { ...memberUser, isApiKey: true, scopes: [] };
    await f.controller.findAll(query, tenantReadRequest(capped), capped);
    expect(f.findAll.mock.calls[1][0].include.brands.where.id).toEqual({
      in: [sessionBrandId],
    });
    f.member.role.key = MemberRole.USER;
    await f.controller.findAll(
      query,
      tenantReadRequest(memberUser),
      memberUser,
    );
    expect(f.findAll.mock.calls[2][0].include.brands.where.id).toEqual({
      in: [sessionBrandId],
    });
  });
});
