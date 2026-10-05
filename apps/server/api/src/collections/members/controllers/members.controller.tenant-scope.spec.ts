import { MembersController } from '@api/collections/members/controllers/members.controller';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
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

describe('MembersController tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const controller = Object.create(
      MembersController.prototype,
    ) as MembersController;
    Object.assign(controller, {
      membersService: { findAll: mock },
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

  it('separates cached reads by the effective organization', () => {
    const config = Reflect.getMetadata(
      'cache',
      MembersController.prototype.findAll,
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

describe('members.controller.findAll cache authorization scope', () => {
  const config: CacheOptions = Reflect.getMetadata(
    'cache',
    MembersController.prototype.findAll,
  );

  it('separates members with different session brands and the same query', () => {
    const query = { brandId: sessionBrandId };
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
    const query = { brandId: sessionBrandId };
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
