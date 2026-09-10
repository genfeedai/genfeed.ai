import { Platform } from '@genfeedai/contracts';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkflowActionDefaults } from './useWorkflowActionDefaults';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-shipshit',
    brands: [{ id: 'brand-shipshit', label: 'Shipshit' }],
    credentials: [
      {
        externalHandle: 'VincentShipsIt',
        id: 'cred-x',
        isConnected: true,
        platform: Platform.TWITTER,
      },
      {
        id: 'cred-ig',
        isConnected: true,
        label: 'ig-account',
        platform: Platform.INSTAGRAM,
      },
    ],
    selectedBrand: {
      agentConfig: { schedule: { timezone: 'America/New_York' } },
      label: 'Shipshit',
    },
  }),
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: () => ({
    strategies: [{ id: 'strategy-1', label: 'Daily ship' }],
  }),
}));

describe('useWorkflowActionDefaults', () => {
  it('prefills brand, timezone, and connected X/LinkedIn accounts', () => {
    const { result } = renderHook(() => useWorkflowActionDefaults());
    const defaults = result.current('daily-publishing.resolve');

    expect(defaults).toEqual({
      brandId: 'brand-shipshit',
      credentialIds: ['cred-x'],
      timezone: 'America/New_York',
    });
  });
});
