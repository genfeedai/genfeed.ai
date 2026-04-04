import { ContextsService } from '@services/ai/contexts.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai' },
}));

describe('ContextsService', () => {
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    ContextsService.clearInstance(mockToken);
  });

  it('is a static factory class', () => {
    expect(typeof ContextsService.getInstance).toBe('function');
    expect(typeof ContextsService.clearInstance).toBe('function');
  });

  it('returns an instance via getInstance', () => {
    const instance = ContextsService.getInstance(mockToken);
    expect(instance).toBeDefined();
  });

  it('returns the same instance for the same token (singleton)', () => {
    const inst1 = ContextsService.getInstance(mockToken);
    const inst2 = ContextsService.getInstance(mockToken);
    expect(inst1).toBe(inst2);
  });

  it('returns different instances for different tokens', () => {
    const inst1 = ContextsService.getInstance('token-A');
    const inst2 = ContextsService.getInstance('token-B');
    expect(inst1).not.toBe(inst2);
  });

  it('instance has context CRUD methods', () => {
    const instance = ContextsService.getInstance(mockToken);
    expect(typeof instance.createContext).toBe('function');
    expect(typeof instance.listContexts).toBe('function');
    expect(typeof instance.getContext).toBe('function');
    expect(typeof instance.updateContext).toBe('function');
    expect(typeof instance.deleteContext).toBe('function');
  });

  it('clearInstance removes the cached instance', () => {
    const inst1 = ContextsService.getInstance(mockToken);
    ContextsService.clearInstance(mockToken);
    const inst2 = ContextsService.getInstance(mockToken);
    expect(inst1).not.toBe(inst2);
  });
});
