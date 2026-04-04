import { describe, expect, it } from 'vitest';
import {
  IntegrationPlatform,
  IntegrationStatus,
} from '../src/integration.enum';

describe('integration.enum', () => {
  describe('IntegrationPlatform', () => {
    it('should have 3 members', () => {
      expect(Object.values(IntegrationPlatform)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(IntegrationPlatform.TELEGRAM).toBe('telegram');
      expect(IntegrationPlatform.SLACK).toBe('slack');
      expect(IntegrationPlatform.DISCORD).toBe('discord');
    });
  });

  describe('IntegrationStatus', () => {
    it('should have 3 members', () => {
      expect(Object.values(IntegrationStatus)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(IntegrationStatus.ACTIVE).toBe('active');
      expect(IntegrationStatus.PAUSED).toBe('paused');
      expect(IntegrationStatus.ERROR).toBe('error');
    });
  });
});
