import { SmartSchedulerService } from '@services/automation/schedules.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai',
    getApiUrl: () => 'https://api.genfeed.ai',
  },
}));

describe('SmartSchedulerService', () => {
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    SmartSchedulerService.clearInstance(mockToken);
  });

  it('is a static factory class', () => {
    expect(typeof SmartSchedulerService.getInstance).toBe('function');
    expect(typeof SmartSchedulerService.clearInstance).toBe('function');
  });

  it('returns an instance via getInstance', () => {
    const instance = SmartSchedulerService.getInstance(mockToken);
    expect(instance).toBeDefined();
  });

  it('returns the same instance for the same token (singleton)', () => {
    const inst1 = SmartSchedulerService.getInstance(mockToken);
    const inst2 = SmartSchedulerService.getInstance(mockToken);
    expect(inst1).toBe(inst2);
  });

  it('instance has scheduling methods', () => {
    const instance = SmartSchedulerService.getInstance(mockToken);
    expect(typeof instance.getOptimalPostingTime).toBe('function');
    expect(typeof instance.createSchedule).toBe('function');
    expect(typeof instance.getSchedules).toBe('function');
    expect(typeof instance.updateSchedule).toBe('function');
    expect(typeof instance.cancelSchedule).toBe('function');
  });

  it('instance has workflow methods', () => {
    const instance = SmartSchedulerService.getInstance(mockToken);
    expect(typeof instance.createWorkflow).toBe('function');
    expect(typeof instance.getWorkflows).toBe('function');
    expect(typeof instance.executeWorkflow).toBe('function');
  });

  it('clearInstance removes the cached instance', () => {
    const inst1 = SmartSchedulerService.getInstance(mockToken);
    SmartSchedulerService.clearInstance(mockToken);
    const inst2 = SmartSchedulerService.getInstance(mockToken);
    expect(inst1).not.toBe(inst2);
  });
});
