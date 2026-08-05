import {
  entityIdArraySchema,
  entityIdSchema,
  isEntityId,
} from '../src/helpers';

describe('entity id helpers', () => {
  const validIds = [
    '507f1f77bcf86cd799439011',
    '550e8400-e29b-41d4-a716-446655440000',
    'cmptu23g70001zixnzwbzwp2e',
    'tz4a98xxat96iws9zmbrgj3a',
    '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  ];

  it.each(validIds)('accepts %s', (id) => {
    expect(isEntityId(id)).toBe(true);
    expect(entityIdSchema.parse(id)).toBe(id);
  });

  it('trims identifiers before returning validated data', () => {
    expect(entityIdSchema.parse('  cmptu23g70001zixnzwbzwp2e  ')).toBe(
      'cmptu23g70001zixnzwbzwp2e',
    );
  });

  it.each(['', 'not an id', 'black-forest-labs/flux-schnell', null])(
    'rejects %s',
    (id) => {
      expect(isEntityId(id)).toBe(false);
      expect(() => entityIdSchema.parse(id)).toThrow();
    },
  );

  it('validates arrays with shared size constraints', () => {
    const schema = entityIdArraySchema({ min: 1, max: 2 });
    expect(schema.parse(validIds.slice(0, 2))).toEqual(validIds.slice(0, 2));
    expect(() => schema.parse([])).toThrow();
    expect(() => schema.parse(validIds.slice(0, 3))).toThrow();
  });
});
