import { CredentialPlatform } from '@genfeedai/contracts';
import type { ValidateChannelTargetSettingsInput } from '@genfeedai/contracts/api-types/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.test.com',
  },
}));

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class MockHTTPBaseService {
    public baseURL: string;
    public token: string;
    public instance = { get: mockGet, post: mockPost };

    constructor(baseURL: string, token: string) {
      this.baseURL = baseURL;
      this.token = token;
    }
  },
}));

import { SchedulesService } from '@services/content/schedules.service';

describe('SchedulesService', () => {
  const token = 'schedule-token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with schedule endpoint', () => {
    const service = new SchedulesService(token);
    const state = service as unknown as { baseURL: string; token: string };

    expect(state.baseURL).toBe(
      `https://api.test.com${API_ENDPOINTS.SCHEDULES}`,
    );
    expect(state.token).toBe(token);
  });

  it('fetches channel capabilities with discovery flags', async () => {
    const capabilities = [{ label: 'YouTube', platform: 'youtube' }];
    mockGet.mockResolvedValue({ data: capabilities });

    const service = new SchedulesService(token);
    const result = await service.getChannelCapabilities({
      includeHidden: true,
    });

    expect(mockGet).toHaveBeenCalledWith('/channel-capabilities', {
      params: { includeHidden: true },
    });
    expect(result).toEqual(capabilities);
  });

  it('fetches one channel capability', async () => {
    const capability = { label: 'TikTok', platform: 'tiktok' };
    mockGet.mockResolvedValue({ data: capability });

    const service = new SchedulesService(token);
    const result = await service.getChannelCapability('tiktok');

    expect(mockGet).toHaveBeenCalledWith('/channel-capabilities/tiktok');
    expect(result).toEqual(capability);
  });

  it('validates channel target settings through the API', async () => {
    const input: ValidateChannelTargetSettingsInput = {
      media: [{ id: 'asset_1', kind: 'video' }],
      platform: CredentialPlatform.YOUTUBE,
      settings: {},
    };
    const validation = {
      errors: [
        {
          code: 'channel_target.required_setting',
          field: 'settings.privacyStatus',
          message: 'YouTube requires Privacy.',
          severity: 'error',
        },
      ],
      platform: CredentialPlatform.YOUTUBE,
      valid: false,
      validationState: 'invalid',
      warnings: [],
    };
    mockPost.mockResolvedValue({ data: validation });

    const service = new SchedulesService(token);
    const result = await service.validateChannelTargetSettings(input);

    expect(mockPost).toHaveBeenCalledWith(
      '/channel-capabilities/validate',
      input,
    );
    expect(result).toEqual(validation);
  });
});
