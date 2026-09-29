import { describe, expect, it } from 'vitest';
import {
  FanvueContentStatus,
  FanvueContentType,
  FanvueEarningsType,
  FanvueScheduleStatus,
  FanvueSubscriberStatus,
  FanvueSyncAction,
  FanvueSyncStatus,
} from '../../src/enums/fanvue.enum';

describe('fanvue.enum', () => {
  describe('FanvueSubscriberStatus', () => {
    it('should have correct values', () => {
      expect(FanvueSubscriberStatus.ACTIVE).toBe('active');
      expect(FanvueSubscriberStatus.EXPIRED).toBe('expired');
      expect(FanvueSubscriberStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('FanvueContentStatus', () => {
    it('should have correct values', () => {
      expect(FanvueContentStatus.DRAFT).toBe('draft');
      expect(FanvueContentStatus.PUBLISHED).toBe('published');
      expect(FanvueContentStatus.ARCHIVED).toBe('archived');
    });
  });

  describe('FanvueContentType', () => {
    it('should have correct values', () => {
      expect(FanvueContentType.IMAGE).toBe('image');
      expect(FanvueContentType.VIDEO).toBe('video');
      expect(FanvueContentType.TEXT).toBe('text');
      expect(FanvueContentType.BUNDLE).toBe('bundle');
    });
  });

  describe('FanvueScheduleStatus', () => {
    it('should have correct values', () => {
      expect(FanvueScheduleStatus.PENDING).toBe('pending');
      expect(FanvueScheduleStatus.PUBLISHED).toBe('published');
      expect(FanvueScheduleStatus.FAILED).toBe('failed');
      expect(FanvueScheduleStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('FanvueEarningsType', () => {
    it('should have correct values', () => {
      expect(FanvueEarningsType.SUBSCRIPTION).toBe('subscription');
      expect(FanvueEarningsType.TIP).toBe('tip');
      expect(FanvueEarningsType.PPV).toBe('ppv');
      expect(FanvueEarningsType.REFERRAL).toBe('referral');
    });
  });

  describe('FanvueSyncAction', () => {
    it('should have correct values', () => {
      expect(FanvueSyncAction.UPLOAD).toBe('upload');
      expect(FanvueSyncAction.PUBLISH).toBe('publish');
      expect(FanvueSyncAction.DELETE).toBe('delete');
      expect(FanvueSyncAction.SYNC_SUBSCRIBERS).toBe('sync_subscribers');
      expect(FanvueSyncAction.SYNC_EARNINGS).toBe('sync_earnings');
    });
  });

  describe('FanvueSyncStatus', () => {
    it('should have correct values', () => {
      expect(FanvueSyncStatus.SUCCESS).toBe('success');
      expect(FanvueSyncStatus.FAILED).toBe('failed');
      expect(FanvueSyncStatus.PARTIAL).toBe('partial');
    });
  });
});
