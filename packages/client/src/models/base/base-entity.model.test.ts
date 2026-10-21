import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import { describe, expect, it } from 'vitest';

// Concrete subclass for testing
class TestEntity extends BaseEntity {
  declare public name: string;
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

  it('skips keys backed by a getter-only accessor on the subclass', () => {
    class DerivedEntity extends BaseEntity {
      declare public name: string;
      get logoUrl(): string | undefined {
        return 'derived';
      }
    }
    const entity = new DerivedEntity({
      id: '1',
      logoUrl: null,
      name: 'Test',
    } as Partial<any>);
    expect(entity.logoUrl).toBe('derived');
    expect(entity.id).toBe('1');
    expect(entity.name).toBe('Test');
  });
});
