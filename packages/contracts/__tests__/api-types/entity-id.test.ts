import {
  entityIdArraySchema,
  entityIdSchema,
  isEntityId,
} from '../../src/api-types/helpers';

// Low-entropy, shape-matching fixtures (not real ids) — see
// packages/contracts/src/api-types/helpers/entity-id.ts for the regexes each satisfies.
const CUID_FIXTURE = 'cid0000000000000000000001'; // ^c[a-z0-9]{8,}$
const CUID2_FIXTURE = 'a00000000000000000000001'; // ^[a-z][a-z0-9]{23}$
const ULID_FIXTURE = '00000000000000000000000001'; // ^[0-9A-HJKMNP-TV-Z]{26}$i
const OBJECT_ID_FIXTURE = '000000000000000000000001'; // rejected: not an accepted shape

describe('entity id helpers', () => {
  const validIds = [
    '550e8400-e29b-41d4-a716-446655440000',
    CUID_FIXTURE,
    CUID2_FIXTURE,
    ULID_FIXTURE,
  ];

  it.each(validIds)('accepts %s', (id) => {
    expect(isEntityId(id)).toBe(true);
    expect(entityIdSchema.parse(id)).toBe(id);
  });

  it('trims identifiers before returning validated data', () => {
    expect(entityIdSchema.parse(`  ${CUID_FIXTURE}  `)).toBe(CUID_FIXTURE);
  });

  it.each([
    '',
    OBJECT_ID_FIXTURE,
    'not an id',
    'black-forest-labs/flux-schnell',
    null,
  ])('rejects %s', (id) => {
    expect(isEntityId(id)).toBe(false);
    expect(() => entityIdSchema.parse(id)).toThrow();
  });

  it('validates arrays with shared size constraints', () => {
    const schema = entityIdArraySchema({ min: 1, max: 2 });
    expect(schema.parse(validIds.slice(0, 2))).toEqual(validIds.slice(0, 2));
    expect(() => schema.parse([])).toThrow();
    expect(() => schema.parse(validIds.slice(0, 3))).toThrow();
  });
});
