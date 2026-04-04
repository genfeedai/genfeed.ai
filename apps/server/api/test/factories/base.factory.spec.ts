import { BaseFactory, MongoIdFactory } from '@test/factories/base.factory';
import {
  clearAllMocks,
  generateTestEmail,
  generateTestId,
  generateTestUrl,
  testErrors,
  waitFor,
} from '@test/mocks/test.helpers';

type TestEntity = {
  id?: string;
  name: string;
  active: boolean;
};

class TestEntityFactory extends BaseFactory<TestEntity> {
  protected getDefaults(): Partial<TestEntity> {
    return {
      active: true,
      id: generateTestId(),
      name: 'default-name',
    };
  }
}

describe('BaseFactory', () => {
  const factory = new TestEntityFactory();

  afterEach(() => {
    clearAllMocks();
  });

  it('creates an entity with defaults and overrides', () => {
    const entity = factory.create({ name: 'override' });

    expect(entity.name).toBe('override');
    expect(entity.active).toBe(true);
    expect(entity.id).toBeDefined();
  });

  it('creates multiple entities with createMany', () => {
    const entities = factory.createMany(3, { active: false });

    expect(entities).toHaveLength(3);
    expect(entities.every((e) => e.active === false)).toBe(true);
  });

  it('supports async creation helpers', async () => {
    const [single, many] = await Promise.all([
      factory.createAsync(),
      factory.createManyAsync(2),
    ]);

    expect(single.name).toBe('default-name');
    expect(many).toHaveLength(2);
  });
});

describe('MongoIdFactory', () => {
  it('creates valid ObjectIds and string representations', () => {
    const objectId = MongoIdFactory.create();
    const stringId = MongoIdFactory.createString();

    expect(MongoIdFactory.isValid(objectId)).toBe(true);
    expect(MongoIdFactory.isValid(stringId)).toBe(true);
  });

  it('creates many ids', () => {
    expect(MongoIdFactory.createMany(2)).toHaveLength(2);
    expect(MongoIdFactory.createManyStrings(3)).toHaveLength(3);
  });
});

describe('test helpers', () => {
  it('generates emails, urls, and waits for promises', async () => {
    expect(generateTestEmail('helper')).toContain('helper.');
    expect(generateTestEmail('helper')).toContain('@example.com');
    expect(generateTestUrl('/path')).toBe('https://test.example.com/path');
    expect(generateTestId()).toHaveLength(24);

    const before = Date.now();
    await waitFor(5);
    expect(Date.now() - before).toBeGreaterThanOrEqual(5);
  });

  it('exposes common error instances', () => {
    expect(testErrors.notFound).toBeInstanceOf(Error);
    expect(testErrors.internalServer.message).toContain(
      'Internal server error',
    );
  });
});
