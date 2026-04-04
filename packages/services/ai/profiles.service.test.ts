import { ProfilesService } from '@services/ai/profiles.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai' },
}));

describe('ProfilesService', () => {
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    ProfilesService.clearInstance(mockToken);
  });

  it('is a static factory class', () => {
    expect(typeof ProfilesService.getInstance).toBe('function');
    expect(typeof ProfilesService.clearInstance).toBe('function');
  });

  it('returns an instance via getInstance', () => {
    const instance = ProfilesService.getInstance(mockToken);
    expect(instance).toBeDefined();
  });

  it('returns the same instance for the same token (singleton)', () => {
    const inst1 = ProfilesService.getInstance(mockToken);
    const inst2 = ProfilesService.getInstance(mockToken);
    expect(inst1).toBe(inst2);
  });

  it('returns different instances for different tokens', () => {
    const inst1 = ProfilesService.getInstance('token-A');
    const inst2 = ProfilesService.getInstance('token-B');
    expect(inst1).not.toBe(inst2);
    ProfilesService.clearInstance('token-A');
    ProfilesService.clearInstance('token-B');
  });

  it('instance has tone profile methods', () => {
    const instance = ProfilesService.getInstance(mockToken);
    expect(typeof instance.getToneProfiles).toBe('function');
    expect(typeof instance.getToneProfile).toBe('function');
    expect(typeof instance.createToneProfile).toBe('function');
    expect(typeof instance.updateToneProfile).toBe('function');
    expect(typeof instance.deleteToneProfile).toBe('function');
  });

  it('instance has specialized tone methods', () => {
    const instance = ProfilesService.getInstance(mockToken);
    expect(typeof instance.setAsDefault).toBe('function');
    expect(typeof instance.applyTone).toBe('function');
    expect(typeof instance.analyzeTone).toBe('function');
  });

  it('clearInstance removes the cached instance', () => {
    const inst1 = ProfilesService.getInstance(mockToken);
    ProfilesService.clearInstance(mockToken);
    const inst2 = ProfilesService.getInstance(mockToken);
    expect(inst1).not.toBe(inst2);
  });
});
