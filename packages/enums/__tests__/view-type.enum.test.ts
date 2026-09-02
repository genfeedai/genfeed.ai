import { describe, expect, it } from 'vitest';
import { ViewType } from '../src/view-type.enum';

describe('view-type.enum', () => {
  describe('ViewType', () => {
    it('should have 7 members', () => {
      expect(Object.values(ViewType)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(ViewType.LIST).toBe('list');
      expect(ViewType.KANBAN).toBe('kanban');
      expect(ViewType.CALENDAR).toBe('calendar');
      expect(ViewType.GRID).toBe('grid');
      expect(ViewType.MASONRY).toBe('masonry');
      expect(ViewType.CANVAS).toBe('canvas');
      expect(ViewType.TABLE).toBe('table');
    });
  });
});
