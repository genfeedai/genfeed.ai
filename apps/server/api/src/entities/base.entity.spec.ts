import { BaseEntity } from '@api/entities/base.entity';

class TestBaseEntity extends BaseEntity {}

describe('BaseEntity', () => {
  it('should be defined', () => {
    expect(BaseEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new TestBaseEntity({ id: 'entity-1' });
    expect(entity).toBeInstanceOf(BaseEntity);
    expect(entity.id).toBe('entity-1');
  });
});
