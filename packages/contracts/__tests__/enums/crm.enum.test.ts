import { describe, expect, it } from 'vitest';
import { LeadStatus } from '../../src/enums/crm.enum';

describe('crm.enum', () => {
  describe('LeadStatus', () => {
    it('should have 5 members matching Prisma', () => {
      expect(Object.values(LeadStatus)).toHaveLength(5);
    });

    it('should match Prisma SCREAMING_SNAKE', () => {
      expect(LeadStatus.NEW).toBe('NEW');
      expect(LeadStatus.CONTACTED).toBe('CONTACTED');
      expect(LeadStatus.QUALIFIED).toBe('QUALIFIED');
      expect(LeadStatus.CONVERTED).toBe('CONVERTED');
      expect(LeadStatus.LOST).toBe('LOST');
    });
  });
});
