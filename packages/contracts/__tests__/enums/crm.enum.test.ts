import { describe, expect, it } from 'vitest';
import {
  CrmTaskPriority,
  CrmTaskStatus,
  LeadSource,
  LeadStatus,
} from '../../src/enums/crm.enum';

describe('crm.enum', () => {
  describe('LeadStatus', () => {
    it('should match Prisma SCREAMING_SNAKE', () => {
      expect(LeadStatus.NEW).toBe('NEW');
      expect(LeadStatus.CONTACTED).toBe('CONTACTED');
      expect(LeadStatus.QUALIFIED).toBe('QUALIFIED');
      expect(LeadStatus.CONVERTED).toBe('CONVERTED');
      expect(LeadStatus.LOST).toBe('LOST');
    });
  });

  describe('LeadSource', () => {
    it('should have correct values', () => {
      expect(LeadSource.INBOUND).toBe('inbound');
      expect(LeadSource.OUTBOUND).toBe('outbound');
      expect(LeadSource.REFERRAL).toBe('referral');
      expect(LeadSource.ORGANIC).toBe('organic');
      expect(LeadSource.PAID).toBe('paid');
      expect(LeadSource.EVENT).toBe('event');
    });
  });

  describe('CrmTaskStatus', () => {
    it('should have correct values', () => {
      expect(CrmTaskStatus.TODO).toBe('todo');
      expect(CrmTaskStatus.IN_PROGRESS).toBe('in-progress');
      expect(CrmTaskStatus.DONE).toBe('done');
      expect(CrmTaskStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('CrmTaskPriority', () => {
    it('should have correct values', () => {
      expect(CrmTaskPriority.LOW).toBe('low');
      expect(CrmTaskPriority.MEDIUM).toBe('medium');
      expect(CrmTaskPriority.HIGH).toBe('high');
      expect(CrmTaskPriority.URGENT).toBe('urgent');
    });
  });
});
