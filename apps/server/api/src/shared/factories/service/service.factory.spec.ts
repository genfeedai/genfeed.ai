import {
  createService,
  createSimpleService,
  createUserScopedService,
} from '@api/shared/factories/service/service.factory';
import { describe, expect, it, vi } from 'vitest';

class Widget {}
class CreateWidgetDto {}
class UpdateWidgetDto {}

describe('createService', () => {
  it('names the generated class after the entity and attaches custom methods', () => {
    const ping = vi.fn(() => 'pong');
    const Service = createService({
      createDto: CreateWidgetDto,
      customMethods: { ping },
      entity: Widget,
      modelName: 'widget',
      updateDto: UpdateWidgetDto,
    });

    expect(Service.name).toBe('WidgetService');
    expect(
      (Service.prototype as unknown as { ping: () => string }).ping(),
    ).toBe('pong');
  });
});

describe('createSimpleService', () => {
  it('builds a service with path-only default populate options', () => {
    const Service = createSimpleService('widget', ['brand', 'user']);
    expect(Service.name).toBe('ObjectService');
    expect(typeof Service).toBe('function');
  });
});

describe('createUserScopedService', () => {
  it('filters by user, or by user/org when organization scoping is on', async () => {
    const Service = createUserScopedService({
      additionalMatchConditions: { kind: 'clip' },
      createDto: CreateWidgetDto,
      entity: Widget,
      includeOrganization: true,
      modelName: 'widget',
      updateDto: UpdateWidgetDto,
    });

    const findAll = vi.fn().mockResolvedValue({ docs: [] });
    const findMany = vi.fn().mockResolvedValue([]);
    const context = {
      delegate: { findMany },
      findAll,
      withSoftDeleteFilter: (where: unknown) => where,
    };

    await (
      Service.prototype as unknown as {
        findAllForUser: (
          userId: string,
          organizationId?: string,
        ) => Promise<unknown>;
      }
    ).findAllForUser.call(context, 'user_1');

    expect(findAll).toHaveBeenCalledWith(
      { where: { kind: 'clip', userId: 'user_1' } },
      {},
    );

    await (
      Service.prototype as unknown as {
        findAllForUser: (
          userId: string,
          organizationId?: string,
        ) => Promise<unknown>;
      }
    ).findAllForUser.call(context, 'user_1', 'org_1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ userId: 'user_1' }, { organizationId: 'org_1' }],
      },
    });
  });

  it('grants access only when a live row matches the user or organization', async () => {
    const Service = createUserScopedService({
      createDto: CreateWidgetDto,
      entity: Widget,
      includeOrganization: true,
      modelName: 'widget',
      updateDto: UpdateWidgetDto,
    });

    const findFirst = vi.fn().mockResolvedValue({ id: 'w1' });
    const context = {
      delegate: { findFirst },
      withSoftDeleteFilter: (where: unknown) => where,
    };

    const canUserAccess = (
      Service.prototype as unknown as {
        canUserAccess: (
          entityId: string,
          userId: string,
          organizationId?: string,
        ) => Promise<boolean>;
      }
    ).canUserAccess.bind(context);

    await expect(canUserAccess('w1', 'user_1', 'org_1')).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        OR: [{ userId: 'user_1' }, { organizationId: 'org_1' }],
        id: 'w1',
      },
    });

    findFirst.mockResolvedValueOnce(null);
    await expect(canUserAccess('missing', 'user_1')).resolves.toBe(false);
  });
});
