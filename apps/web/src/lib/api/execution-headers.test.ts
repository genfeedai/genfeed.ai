import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProviderHeader = vi.fn();

vi.mock('@genfeedai/workflows/ui/stores', () => ({
  useSettingsStore: {
    getState: () => ({
      getProviderHeader,
    }),
  },
}));

import { getExecutionProviderHeaders } from './execution-headers';

describe('getExecutionProviderHeaders', () => {
  beforeEach(() => {
    getProviderHeader.mockReset();
    getProviderHeader.mockImplementation((provider: string) => {
      if (provider === 'replicate') {
        return { 'X-Replicate-Key': 'r8_test' };
      }
      if (provider === 'fal') {
        return { 'X-Fal-Key': 'fal_test' };
      }
      return {};
    });
  });

  it('merges configured BYOK provider headers and omits empty ones', () => {
    expect(getExecutionProviderHeaders()).toEqual({
      'X-Fal-Key': 'fal_test',
      'X-Replicate-Key': 'r8_test',
    });
  });

  it.each([
    ['replicate', { 'X-Replicate-Key': 'r8_only' }],
    ['fal', { 'X-Fal-Key': 'fal_only' }],
    ['openrouter', { 'X-OpenRouter-Key': 'or_only' }],
  ])('carries the %s key when it is the only one set', (provider, header) => {
    getProviderHeader.mockImplementation((requested: string) =>
      requested === provider ? header : {},
    );

    expect(getExecutionProviderHeaders()).toEqual(header);
  });

  it('returns an empty record when no local keys are set', () => {
    getProviderHeader.mockReturnValue({});

    expect(getExecutionProviderHeaders()).toEqual({});
  });
});
