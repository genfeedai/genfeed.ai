import { describe, expect, it } from 'vitest';
import { CrudAction } from '../src/crud-action.enum';

describe('crud-action.enum', () => {
  describe('CrudAction', () => {
    it('should have 3 members', () => {
      expect(Object.values(CrudAction)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(CrudAction.CREATED).toBe('created');
      expect(CrudAction.UPDATED).toBe('updated');
      expect(CrudAction.DELETED).toBe('deleted');
    });
  });
});
