import { describe, expect, it } from 'vitest';
import {
  CrmTaskPriority,
  CrmTaskStatus,
  LeadSource,
  LeadStatus,
} from '../src/crm.enum';

describe('crm.enum', () => {
  describe('LeadStatus', () => {
    it('should have 7 members', () => {
      expect(Object.values(LeadStatus)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(LeadStatus.NEW).toBe('new');
      expect(LeadStatus.CONTACTED).toBe('contacted');
      expect(LeadStatus.QUALIFIED).toBe('qualified');
      expect(LeadStatus.PROPOSAL).toBe('proposal');
      expect(LeadStatus.NEGOTIATION).toBe('negotiation');
      expect(LeadStatus.WON).toBe('won');
      expect(LeadStatus.LOST).toBe('lost');
    });
  });

  describe('LeadSource', () => {
    it('should have 6 members', () => {
      expect(Object.values(LeadSource)).toHaveLength(6);
    });

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
    it('should have 4 members', () => {
      expect(Object.values(CrmTaskStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(CrmTaskStatus.TODO).toBe('todo');
      expect(CrmTaskStatus.IN_PROGRESS).toBe('in-progress');
      expect(CrmTaskStatus.DONE).toBe('done');
      expect(CrmTaskStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('CrmTaskPriority', () => {
    it('should have 4 members', () => {
      expect(Object.values(CrmTaskPriority)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(CrmTaskPriority.LOW).toBe('low');
      expect(CrmTaskPriority.MEDIUM).toBe('medium');
      expect(CrmTaskPriority.HIGH).toBe('high');
      expect(CrmTaskPriority.URGENT).toBe('urgent');
    });
  });
});
