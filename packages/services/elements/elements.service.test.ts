import { ElementsService } from '@services/elements/elements.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai' },
}));

vi.mock('@genfeedai/constants', () => ({
  API_ENDPOINTS: { ELEMENTS: '/elements' },
}));

vi.mock('axios', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: {} } }) },
}));

describe('ElementsService', () => {
  it('is a class with static methods', () => {
    expect(typeof ElementsService.findAllElements).toBe('function');
  });

  it('findAllElements is a static async function', async () => {
    const result = await ElementsService.findAllElements('test-token');
    expect(result).toBeDefined();
  });

  it('does not require instantiation', () => {
    // ElementsService methods are all static
    expect(ElementsService.findAllElements).toBeDefined();
  });
});
