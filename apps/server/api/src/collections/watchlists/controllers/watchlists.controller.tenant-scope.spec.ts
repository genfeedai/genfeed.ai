import { WatchlistsController } from '@api/collections/watchlists/controllers/watchlists.controller';
import {
  adminUser,
  fieldValues,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetBrandId,
  targetOrganizationId,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('WatchlistsController tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue([]);
    const controller = Object.create(
      WatchlistsController.prototype,
    ) as WatchlistsController;
    Object.assign(controller, {
      service: { findAllByAccount: mock },
      loggerService: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = {
      organizationId: targetOrganizationId,
      brandId: targetBrandId,
    };
    const request = tenantReadRequest(user, query);
    await controller.findAll(request, user, query);
    const read = mock.mock.calls[0]?.[1];
    expect(read).toBe(targetOrganizationId);
    expect(fieldValues(read, 'brandId')).not.toContain(sessionBrandId);
  });

  it('rejects a member foreign organization before reading', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = { organizationId: targetOrganizationId };
    const request = tenantReadRequest(user, query);
    await expect(controller.findAll(request, user, query)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('keeps the session organization for a member without an override', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = {};
    const request = tenantReadRequest(user);
    await controller.findAll(request, user, query);
    expect(mock.mock.calls[0]?.[1]).toBe(sessionOrganizationId);
  });

  it.each(['', '  '])(
    'rejects a missing organization (%s) before listing',
    async (organizationId) => {
      const { controller, mock } = setup();
      const user = { ...memberUser, organizationId };
      await expect(
        controller.findAll(tenantReadRequest(user), user),
      ).rejects.toThrow(BadRequestException);
      expect(mock).not.toHaveBeenCalled();
    },
  );

  it('requires an explicit brand for a cross-organization list', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = { organizationId: targetOrganizationId };
    const request = tenantReadRequest(user, query);
    await expect(controller.findAll(request, user, query)).rejects.toThrow(
      BadRequestException,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('rejects a member foreign brand', async () => {
    const { controller, mock } = setup();
    await expect(
      controller.findAll(tenantReadRequest(), memberUser, {
        brandId: targetBrandId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(mock).not.toHaveBeenCalled();
  });
});

describe('Watchlist detail reads (#6176)', () => {
  const id = 'watchlist-target';
  function setup() {
    const findOne = vi.fn(async (where: Record<string, unknown>) =>
      where.organizationId === targetOrganizationId
        ? { id, organizationId: targetOrganizationId }
        : null,
    );
    const controller = Object.create(
      WatchlistsController.prototype,
    ) as WatchlistsController;
    Object.assign(controller, { service: { findOne } });
    return { controller, findOne };
  }
  it.each(['', '  '])(
    'rejects a missing organization (%s) before reading',
    async (organizationId) => {
      const { controller, findOne } = setup();
      const user = { ...memberUser, organizationId };
      await expect(
        controller.findOne(tenantReadRequest(user), user, id),
      ).rejects.toThrow(BadRequestException);
      expect(findOne).not.toHaveBeenCalled();
    },
  );
  it('returns 404 for a superadmin foreign row without override', async () => {
    const { controller, findOne } = setup();
    await expect(
      controller.findOne(tenantReadRequest(adminUser), adminUser, id),
    ).rejects.toMatchObject({ status: 404 });
    expect(findOne).toHaveBeenCalledWith({
      id,
      organizationId: sessionOrganizationId,
      isDeleted: false,
    });
  });
  it('returns the foreign row only with the matching superadmin override', async () => {
    const { controller, findOne } = setup();
    const result = await controller.findOne(
      tenantReadRequest(adminUser),
      adminUser,
      id,
      { organizationId: targetOrganizationId },
    );
    expect(result.data?.id).toBe(id);
    expect(findOne).toHaveBeenCalledWith({
      id,
      organizationId: targetOrganizationId,
      isDeleted: false,
    });
  });
  it('returns 404 for a member foreign row without override', async () => {
    const { controller } = setup();
    await expect(
      controller.findOne(tenantReadRequest(), memberUser, id),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('rejects a member foreign override before reading', async () => {
    const { controller, findOne } = setup();
    await expect(
      controller.findOne(tenantReadRequest(), memberUser, id, {
        organizationId: targetOrganizationId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(findOne).not.toHaveBeenCalled();
  });
});
