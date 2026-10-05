import { VideosController } from '@api/collections/videos/controllers/videos.controller';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import {
  adminUser,
  emptyPage,
  fieldValues,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetBrandId,
  targetOrganizationId,
  tenantReadQuery,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { ForbiddenException } from '@nestjs/common';

describe('VideosController tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const controller = Object.create(
      VideosController.prototype,
    ) as VideosController;
    Object.assign(controller, {
      videosService: { findAll: mock },
      loggerService: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = tenantReadQuery(VideosQueryDto, {
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
  });

  it('rejects a member foreign organization before reading', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(VideosQueryDto, {
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
    const query = tenantReadQuery(VideosQueryDto, {});
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
  });

  it('scopes latest reads to the target org without the session brand', async () => {
    const { controller, mock } = setup();
    await controller.findAll(
      tenantReadRequest(adminUser),
      adminUser,
      tenantReadQuery(VideosQueryDto, {
        latest: true,
        organizationId: targetOrganizationId,
      }),
    );
    expect(fieldValues(mock.mock.calls[0]?.[0], 'organizationId')).toContain(
      targetOrganizationId,
    );
    expect(
      fieldValues(mock.mock.calls[0]?.[0], 'organizationId'),
    ).not.toContain(sessionOrganizationId);
    expect(fieldValues(mock.mock.calls[0]?.[0], 'brandId')).not.toContain(
      sessionBrandId,
    );
  });

  it('uses an explicit target brand for latest reads', async () => {
    const { controller, mock } = setup();
    await controller.findAll(
      tenantReadRequest(adminUser),
      adminUser,
      tenantReadQuery(VideosQueryDto, {
        latest: true,
        organizationId: targetOrganizationId,
        brandId: targetBrandId,
      }),
    );
    expect(fieldValues(mock.mock.calls[0]?.[0], 'brandId')).toContain(
      targetBrandId,
    );
  });

  it('separates cached reads by the effective organization', () => {
    const config = Reflect.getMetadata(
      'cache',
      VideosController.prototype.findAll,
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
