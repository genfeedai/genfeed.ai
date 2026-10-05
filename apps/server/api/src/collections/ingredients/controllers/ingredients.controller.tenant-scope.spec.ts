import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
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

describe('IngredientsController tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const controller = Object.create(
      IngredientsController.prototype,
    ) as IngredientsController;
    Object.assign(controller, {
      ingredientsService: { findAll: mock },
      loggerService: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = tenantReadQuery(IngredientsQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await controller.findAll(request, query, user);
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
    const query = tenantReadQuery(IngredientsQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await expect(controller.findAll(request, query, user)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('rejects a member requesting another session brand before reading', async () => {
    const { controller, mock } = setup();
    const query = tenantReadQuery(IngredientsQueryDto, {
      brandId: targetBrandId,
    });
    await expect(
      controller.findAll(
        tenantReadRequest(memberUser, query),
        query,
        memberUser,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(mock).not.toHaveBeenCalled();
  });

  it('keeps the session organization for a member without an override', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(IngredientsQueryDto, {});
    const request = tenantReadRequest(user);
    await controller.findAll(request, query, user);
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
      IngredientsController.prototype.findAll,
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

describe('IngredientsController.getSummary tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue({});
    const controller = Object.create(
      IngredientsController.prototype,
    ) as IngredientsController;
    Object.assign(controller, {
      ingredientsService: { getLibrarySummary: mock },
    });
    return { controller, mock };
  }
  it('uses the target organization for a superadmin', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = tenantReadQuery(IngredientsQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await controller.getSummary(request, query, user);
    expect(mock.mock.calls[0]?.[0]).toBe(targetOrganizationId);
    expect(fieldValues(mock.mock.calls[0], 'brandId')).not.toContain(
      sessionBrandId,
    );
  });
  it('rejects a member foreign organization', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(IngredientsQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await expect(controller.getSummary(request, query, user)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mock).not.toHaveBeenCalled();
  });
  it('rejects a member requesting another session brand before counting', async () => {
    const { controller, mock } = setup();
    const query = tenantReadQuery(IngredientsQueryDto, {
      brandId: targetBrandId,
    });
    await expect(
      controller.getSummary(
        tenantReadRequest(memberUser, query),
        query,
        memberUser,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(mock).not.toHaveBeenCalled();
  });

  it('retains the member session scope', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(IngredientsQueryDto, {});
    const request = tenantReadRequest(user);
    await controller.getSummary(request, query, user);
    expect(mock.mock.calls[0]?.[0]).toBe(sessionOrganizationId);
  });
});

describe('ingredients.controller.findAll cache authorization scope', () => {
  const config: CacheOptions = Reflect.getMetadata(
    'cache',
    IngredientsController.prototype.findAll,
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

describe('ingredients.controller.getSummary cache authorization scope', () => {
  const config: CacheOptions = Reflect.getMetadata(
    'cache',
    IngredientsController.prototype.getSummary,
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
