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

  it('instance has scheduling methods', () => {
    const instance = SmartSchedulerService.getInstance(mockToken);
    expect(typeof instance.getOptimalPostingTime).toBe('function');
    expect(typeof instance.createSchedule).toBe('function');
    expect(typeof instance.getSchedules).toBe('function');
    expect(typeof instance.updateSchedule).toBe('function');
    expect(typeof instance.cancelSchedule).toBe('function');
  });

  // Workflow authoring moved to the workflows collection; the scheduler only
  // still starts an execution for an existing workflow.
});
