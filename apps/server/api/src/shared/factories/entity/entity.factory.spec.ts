import { BaseEntity } from '@api/entities/base.entity';
import { EntityFactory } from '@api/shared/factories/entity/entity.factory';
import { describe, expect, it } from 'vitest';

class WidgetEntity extends BaseEntity {}

describe('EntityFactory', () => {
  it('creates single entities, batches, and default-merged instances', () => {
    const widget = EntityFactory.create(WidgetEntity, {
      id: 'w1',
      label: 'Clip',
    });
    expect(widget).toBeInstanceOf(WidgetEntity);
    expect(widget.id).toBe('w1');
    expect(widget.label).toBe('Clip');

    const batch = EntityFactory.createBatch(WidgetEntity, [
      { id: 'a' },
      { id: 'b' },
    ]);
    expect(batch.map((item) => item.id)).toEqual(['a', 'b']);

    const withDefaults = EntityFactory.createWithDefaults(
      WidgetEntity,
      { id: 'w2', label: 'Override' },
      { label: 'Default', ownerId: 'user_1' },
    );
    expect(withDefaults.label).toBe('Override');
    expect(withDefaults.ownerId).toBe('user_1');
  });

  it('transforms mapped or raw records and rejects invalid input', () => {
    const mapped = EntityFactory.transform(
      WidgetEntity,
      { name: 'Mapped', pk: 'w3' },
      { id: 'pk', label: 'name' },
    );
    expect(mapped.id).toBe('w3');
    expect(mapped.label).toBe('Mapped');

    const raw = EntityFactory.transform(WidgetEntity, {
      id: 'w4',
      label: 'Raw',
    });
    expect(raw.label).toBe('Raw');

    expect(() =>
      EntityFactory.transform(
        WidgetEntity,
        null as unknown as Record<string, unknown>,
      ),
    ).toThrow('Invalid data provided for transformation');
  });

  it('hydrates documents, collapsing populated relations to ids', () => {
    const fromObject = EntityFactory.fromDocument(
      WidgetEntity,
      {
        toObject: () => ({
          id: 'w5',
          parent: { id: 'p1', label: 'Parent' },
        }),
      },
      ['parent'],
    );
    expect(fromObject.id).toBe('w5');
    expect(fromObject.parent).toBe('p1');

    const fromPlain = EntityFactory.fromDocuments(WidgetEntity, [
      { id: 'w6', label: 'Plain' },
    ]);
    expect(fromPlain[0]?.label).toBe('Plain');

    expect(() => EntityFactory.fromDocument(WidgetEntity, null)).toThrow(
      'Invalid document provided',
    );
  });
});
