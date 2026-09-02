import {
  createCRUDController,
  createCRUDModule,
  createExtendedController,
} from '@api/shared/factories/controller/controller.factory';
import type { IJsonApiSerializer } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

class Widget {}
class CreateWidgetDto {}
class UpdateWidgetDto {}
class WidgetService {}

const serializer: IJsonApiSerializer = {
  serialize: (data: unknown) => data,
};

describe('createCRUDController', () => {
  it('names the controller and attaches custom routes', () => {
    const ping = () => 'pong';
    const Controller = createCRUDController({
      customRoutes: { ping },
      entityName: 'Widget',
      serializer,
      service: WidgetService as never,
    });

    expect(Controller.name).toBe('WidgetController');
    expect(
      (Controller.prototype as unknown as { ping: () => string }).ping(),
    ).toBe('pong');
  });
});

describe('createExtendedController', () => {
  it('uses supplied overrides and falls back to the base implementation', () => {
    const Controller = createExtendedController({
      buildFindAllQuery: () => ({ where: { custom: true } }),
      canUserModifyEntity: () => true,
      canUserReadEntity: () => false,
      customRoutes: { extra: () => 1 },
      enrichCreateDto: (dto) => dto,
      enrichUpdateDto: (dto) => dto,
      entityName: 'Widget',
      serializer,
      service: WidgetService as never,
    });

    expect(Controller.name).toBe('ExtendedWidgetController');
    expect(
      (Controller.prototype as unknown as { extra: () => number }).extra(),
    ).toBe(1);

    const instance = Object.create(Controller.prototype) as {
      buildFindAllQuery: (user: unknown, query: unknown) => unknown;
      canUserModifyEntity: (user: unknown, entity: unknown) => boolean;
      canUserReadEntity: (user: unknown, entity: unknown) => boolean;
      enrichCreateDto: (dto: unknown, user: unknown) => unknown;
      enrichUpdateDto: (dto: unknown, user: unknown) => unknown;
    };

    expect(instance.buildFindAllQuery({}, {})).toEqual({
      where: { custom: true },
    });
    expect(instance.canUserModifyEntity({}, {})).toBe(true);
    expect(instance.canUserReadEntity({}, {})).toBe(false);
    expect(instance.enrichCreateDto({ label: 'a' }, {})).toEqual({
      label: 'a',
    });
    expect(instance.enrichUpdateDto({ label: 'b' }, {})).toEqual({
      label: 'b',
    });
  });
});

describe('createCRUDModule', () => {
  it('requires a model name and rejects null imports', () => {
    expect(() =>
      createCRUDModule({
        createDto: CreateWidgetDto,
        entity: Widget,
        name: 'Widget',
        serializer,
        updateDto: UpdateWidgetDto,
      }),
    ).toThrow(/modelName is required/);

    expect(() =>
      createCRUDModule({
        createDto: CreateWidgetDto,
        entity: Widget,
        imports: [undefined as never],
        modelName: 'widget',
        name: 'Widget',
        serializer,
        updateDto: UpdateWidgetDto,
      }),
    ).toThrow(/undefined\/null value/);
  });

  it('returns a named module, service, and controller', () => {
    const created = createCRUDModule({
      createDto: CreateWidgetDto,
      entity: Widget,
      modelName: 'widget',
      name: 'Widget',
      populateFields: ['brand', { path: 'user', select: ['id'] }],
      serializer,
      updateDto: UpdateWidgetDto,
    });

    expect(created.module.name).toBe('WidgetModule');
    expect(created.service.name).toBe('UserScopedFactoryService');
    expect(created.controller.name).toBe('WidgetController');
  });
});
