import { AvatarsController } from '@api/collections/avatars/controllers/avatars.controller';
import { AvatarsQueryDto } from '@api/collections/avatars/dto/avatars-query.dto';
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
import { ForbiddenException } from '@nestjs/common';

describe('AvatarsController tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const controller = Object.create(
      AvatarsController.prototype,
    ) as AvatarsController;
    Object.assign(controller, {
      avatarsService: { findAll: mock },
      loggerService: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = tenantReadQuery(AvatarsQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await controller.findAll(request, user, query);
    const read = mock.mock.calls[0]?.[0];
    expect(fieldValues(read, 'organizationId')).toContain(targetOrganizationId);
    expect(fieldValues(read, 'organizationId')).not.toContain(
      sessionOrganizationId,
    );
    expect(fieldValues(read, 'isDeleted')).not.toContain(true);
    expect(fieldValues(read, 'brandId')).not.toContain(sessionBrandId);
    expect(fieldValues(read, 'userId')).toEqual([]);
  });

  it('rejects a member foreign organization before reading', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(AvatarsQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await expect(controller.findAll(request, user, query)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('keeps the session organization for a member without an override', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(AvatarsQueryDto, {});
    const request = tenantReadRequest(user);
    await controller.findAll(request, user, query);
    expect(fieldValues(mock.mock.calls[0]?.[0], 'organizationId')).toContain(
      sessionOrganizationId,
    );
    expect(
      fieldValues(mock.mock.calls[0]?.[0], 'organizationId'),
    ).not.toContain(targetOrganizationId);
    expect(fieldValues(mock.mock.calls[0]?.[0], 'isDeleted')).not.toContain(
      true,
    );
    expect(fieldValues(mock.mock.calls[0]?.[0], 'userId')).toContain(
      user.userId,
    );
  });
  it('keeps caller ownership for a superadmin querying the session organization', async () => {
    const { controller, mock } = setup();
    const query = tenantReadQuery(AvatarsQueryDto, {
      organizationId: sessionOrganizationId,
    });
    await controller.findAll(
      tenantReadRequest(adminUser, query),
      adminUser,
      query,
    );
    expect(fieldValues(mock.mock.calls[0]?.[0], 'userId')).toContain(
      adminUser.userId,
    );
  });
});
