import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import type { CacheOptions } from '@api/shared/interfaces/cache/cache.interfaces';
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

describe('ImagesController tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const controller = Object.create(
      ImagesController.prototype,
    ) as ImagesController;
    Object.assign(controller, {
      imagesService: { findAll: mock },
      loggerService: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = tenantReadQuery(ImagesQueryDto, {
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
    const query = tenantReadQuery(ImagesQueryDto, {
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
    const query = tenantReadQuery(ImagesQueryDto, {});
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
      tenantReadQuery(ImagesQueryDto, {
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
    expect(fieldValues(mock.mock.calls[0]?.[0], 'userId')).toEqual([]);
  });

  it('uses an explicit target brand for latest reads', async () => {
    const { controller, mock } = setup();
    await controller.findAll(
      tenantReadRequest(adminUser),
      adminUser,
      tenantReadQuery(ImagesQueryDto, {
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
      ImagesController.prototype.findAll,
    );
    const first = config.keyGenerator(
      tenantReadRequest(adminUser, { latest: 'true' }),
    );
    const second = config.keyGenerator(
      tenantReadRequest(adminUser, {
        latest: 'true',
        organizationId: targetOrganizationId,
      }),
    );
    const switched = config.keyGenerator(
      tenantReadRequest(
        { ...adminUser, organizationId: targetOrganizationId },
        { latest: 'true' },
      ),
    );
    expect(second).toContain(targetOrganizationId);
    expect(switched).toContain(targetOrganizationId);
    expect(second).not.toBe(first);
    expect(switched).not.toBe(first);
  });
  it.each([adminUser, memberUser])(
    'keeps caller ownership for latest reads in the session organization',
    async (user) => {
      const { controller, mock } = setup();
      const query = tenantReadQuery(ImagesQueryDto, {
        latest: true,
        organizationId: sessionOrganizationId,
      });
      await controller.findAll(tenantReadRequest(user, query), user, query);
      expect(fieldValues(mock.mock.calls[0]?.[0], 'userId')).toContain(
        user.userId,
      );
    },
  );
});

describe('images.controller.findAll cache authorization scope', () => {
  const config: CacheOptions = Reflect.getMetadata(
    'cache',
    ImagesController.prototype.findAll,
  );

  it('separates members with different session brands and the same query', () => {
    const query = { brandId: sessionBrandId, latest: 'true' };
    const first = config.keyGenerator?.(tenantReadRequest(memberUser, query));
    const second = config.keyGenerator?.(
      tenantReadRequest(
        {
          ...memberUser,
          id: 'another-member',
          userId: 'another-member',
          brandId: targetBrandId,
        },
        query,
      ),
    );
    const switched = config.keyGenerator?.(
      tenantReadRequest({ ...memberUser, brandId: targetBrandId }, query),
    );
    expect(first).toContain(sessionBrandId);
    expect(second).not.toBe(first);
    expect(switched).not.toBe(first);
  });

  it('separates session organizations under the same effective organization', () => {
    const query = {
      organizationId: targetOrganizationId,
      brandId: targetBrandId,
      latest: 'true',
    };
    const first = config.keyGenerator?.(tenantReadRequest(adminUser, query));
    const second = config.keyGenerator?.(
      tenantReadRequest(
        { ...adminUser, organizationId: targetOrganizationId },
        query,
      ),
    );
    expect(first).toContain(targetOrganizationId);
    expect(second).not.toBe(first);
  });

  it('separates callers within the same session scope', () => {
    const query = { brandId: sessionBrandId, latest: 'true' };
    const first = config.keyGenerator?.(tenantReadRequest(memberUser, query));
    const second = config.keyGenerator?.(
      tenantReadRequest(
        { ...memberUser, id: 'another-member', userId: 'another-member' },
        query,
      ),
    );
    expect(first).toContain(memberUser.id);
    expect(second).not.toBe(first);
  });
});

it('separates latest-image queries with different requested brands', () => {
  const config: CacheOptions = Reflect.getMetadata(
    'cache',
    ImagesController.prototype.findAll,
  );
  const query = { latest: 'true', organizationId: targetOrganizationId };
  const first = config.keyGenerator?.(tenantReadRequest(adminUser, query));
  const second = config.keyGenerator?.(
    tenantReadRequest(adminUser, { ...query, brandId: targetBrandId }),
  );
  expect(first).toContain(targetOrganizationId);
  expect(second).not.toBe(first);
});
