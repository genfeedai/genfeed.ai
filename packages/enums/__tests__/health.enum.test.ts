import { describe, expect, it } from 'vitest';
import { ServiceHealthStatus } from '../src/health.enum';

describe('health.enum', () => {
  describe('ServiceHealthStatus', () => {
    it('should have 3 members', () => {
      expect(Object.values(ServiceHealthStatus)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ServiceHealthStatus.HEALTHY).toBe('healthy');
      expect(ServiceHealthStatus.UNHEALTHY).toBe('unhealthy');
      expect(ServiceHealthStatus.DEGRADED).toBe('degraded');
    });
  });
});
