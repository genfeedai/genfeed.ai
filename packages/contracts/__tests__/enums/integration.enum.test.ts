import { describe, expect, it } from 'vitest';
import {
  IntegrationPlatform,
  IntegrationStatus,
} from '../../src/enums/integration.enum';

describe('integration.enum', () => {
  describe('IntegrationPlatform', () => {
    it('should have 5 members', () => {
      expect(Object.values(IntegrationPlatform)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(IntegrationPlatform.TELEGRAM).toBe('TELEGRAM');
      expect(IntegrationPlatform.SLACK).toBe('SLACK');
      expect(IntegrationPlatform.DISCORD).toBe('DISCORD');
      expect(IntegrationPlatform.UNIPILE).toBe('UNIPILE');
      expect(IntegrationPlatform.RESTREAM).toBe('RESTREAM');
    });
  });

  describe('IntegrationStatus', () => {
    it('should have 3 members', () => {
      expect(Object.values(IntegrationStatus)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(IntegrationStatus.ACTIVE).toBe('ACTIVE');
      expect(IntegrationStatus.PAUSED).toBe('PAUSED');
      expect(IntegrationStatus.ERROR).toBe('ERROR');
    });
  });
});
