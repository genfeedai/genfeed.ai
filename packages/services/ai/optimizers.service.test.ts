import { OptimizersService } from '@services/ai/optimizers.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai' },
}));

describe('OptimizersService', () => {
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    OptimizersService.clearInstance(mockToken);
  });

  it('is a static factory class', () => {
    expect(typeof OptimizersService.getInstance).toBe('function');
    expect(typeof OptimizersService.clearInstance).toBe('function');
  });

  it('returns an instance via getInstance', () => {
    const instance = OptimizersService.getInstance(mockToken);
    expect(instance).toBeDefined();
  });

  it('returns the same instance for the same token (singleton)', () => {
    const inst1 = OptimizersService.getInstance(mockToken);
    const inst2 = OptimizersService.getInstance(mockToken);
    expect(inst1).toBe(inst2);
  });

  it('returns different instances for different tokens', () => {
    const inst1 = OptimizersService.getInstance('token-A');
    const inst2 = OptimizersService.getInstance('token-B');
    expect(inst1).not.toBe(inst2);
    OptimizersService.clearInstance('token-A');
    OptimizersService.clearInstance('token-B');
  });

  it('instance has content optimization methods', () => {
    const instance = OptimizersService.getInstance(mockToken);
    expect(typeof instance.analyzeContent).toBe('function');
    expect(typeof instance.optimizeContent).toBe('function');
    expect(typeof instance.optimizeHashtags).toBe('function');
    expect(typeof instance.getBestPostingTimes).toBe('function');
    expect(typeof instance.generateVariants).toBe('function');
  });

  it('clearInstance removes the cached instance', () => {
    const inst1 = OptimizersService.getInstance(mockToken);
    OptimizersService.clearInstance(mockToken);
    const inst2 = OptimizersService.getInstance(mockToken);
    expect(inst1).not.toBe(inst2);
  });
});
