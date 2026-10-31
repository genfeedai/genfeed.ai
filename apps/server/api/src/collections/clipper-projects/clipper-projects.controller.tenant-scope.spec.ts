import { ClipperProjectsController } from '@api/collections/clipper-projects/clipper-projects.controller';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { SearchBaseQueryDto } from '@api/helpers/dto/search-base-query.dto';
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

describe('ClipperProjectsController tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const controller = Object.create(
      ClipperProjectsController.prototype,
    ) as ClipperProjectsController;
    Object.assign(controller, {
      clipperProjectsService: { findAll: mock },
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
    const query = tenantReadQuery(BaseQueryDto, {
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
    const query = tenantReadQuery(BaseQueryDto, {});
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

  it('scopes a brand list to that brand plus brandless projects, inside the organization', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(BaseQueryDto, { brandId: 'brand-9' });
    const request = tenantReadRequest(user);
    await controller.findAll(request, user, query);
    expect(mock.mock.calls[0]?.[0].where).toMatchObject({
      OR: [{ brandId: null }, { brandId: 'brand-9' }],
      isDeleted: false,
      organizationId: sessionOrganizationId,
    });
  });

  it('adds the search inside the tenant scope instead of replacing the brand filter', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(SearchBaseQueryDto, {
      brandId: 'brand-9',
      search: ' launch ',
    });
    const request = tenantReadRequest(user);
    await controller.findAll(request, user, query);
    expect(mock.mock.calls[0]?.[0].where).toEqual({
      AND: [
        {
          OR: [
            {
              config: {
                mode: 'insensitive',
                path: ['name'],
                string_contains: 'launch',
              },
            },
            {
              config: {
                mode: 'insensitive',
                path: ['sourceVideoUrl'],
                string_contains: 'launch',
              },
            },
          ],
        },
      ],
      OR: [{ brandId: null }, { brandId: 'brand-9' }],
      isDeleted: false,
      organizationId: sessionOrganizationId,
    });
  });
});
