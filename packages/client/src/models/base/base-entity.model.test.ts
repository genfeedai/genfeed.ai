import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import { describe, expect, it } from 'vitest';

// Concrete subclass for testing
class TestEntity extends BaseEntity {
  public declare name: string;
  constructor(data: Partial<any> = {}) {
    super(data);
  }
}

describe('BaseEntity', () => {
  it('assigns properties from constructor data', () => {
    const entity = new TestEntity({
      createdAt: '2024-01-01',
      id: '123',
      isDeleted: false,
      updatedAt: '2024-01-02',
    });
    expect(entity.id).toBe('123');
    expect(entity.isDeleted).toBe(false);
    expect(entity.createdAt).toBe('2024-01-01');
    expect(entity.updatedAt).toBe('2024-01-02');
  });

  it('handles empty constructor', () => {
    const entity = new TestEntity();
    expect(entity.id).toBeUndefined();
  });

  it('assigns extra fields via Object.assign', () => {
    const entity = new TestEntity({ id: '1', name: 'Test' });
    expect(entity.name).toBe('Test');
  });
});
