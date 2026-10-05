import { UsersRelationshipsController } from '@api/collections/users/controllers/users-relationships.controller';
import {
  adminUser,
  emptyPage,
  fieldValues,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetOrganizationId,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { ForbiddenException } from '@nestjs/common';

describe('UsersRelationshipsController tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const controller = Object.assign(
      Object.create(
        UsersRelationshipsController.prototype,
      ) as UsersRelationshipsController,
      {
        brandsService: { findAll: mock },
        loggerService: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        membersService: {
          findOne: vi.fn().mockResolvedValue({ brands: [sessionBrandId] }),
        },
      },
    );
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = { organizationId: targetOrganizationId };
    const request = tenantReadRequest(user, query);
    await controller.findMeBrands(user, request, query);
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
    const query = { organizationId: targetOrganizationId };
    const request = tenantReadRequest(user, query);
    await expect(controller.findMeBrands(user, request, query)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('keeps the session organization for a member without an override', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = {};
    const request = tenantReadRequest(user);
    await controller.findMeBrands(user, request, query);
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

  it('separates cached reads by the effective organization', () => {
    const config = Reflect.getMetadata(
      'cache',
      UsersRelationshipsController.prototype.findMeBrands,
    );
    const first = config.keyGenerator(tenantReadRequest(adminUser));
    const second = config.keyGenerator(
      tenantReadRequest(adminUser, { organizationId: targetOrganizationId }),
    );
    const switched = config.keyGenerator(
      tenantReadRequest({ ...adminUser, organizationId: targetOrganizationId }),
    );
    expect(second).toContain(targetOrganizationId);
    expect(switched).toContain(targetOrganizationId);
    expect(second).not.toBe(first);
    expect(switched).not.toBe(first);
  });
});
