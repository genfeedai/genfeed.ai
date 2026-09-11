import { Platform } from '@genfeedai/contracts';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useWorkflowActionDefaults,
  useWorkflowActionScope,
} from './useWorkflowActionDefaults';

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
      // LinkedIn's member profile has no public handle (see the #4695
      // handle audit) — only externalName, which must still surface a real
      // label instead of falling straight to the platform name.
      {
        externalName: 'Vincent Ships It',
        id: 'cred-li',
        isConnected: true,
        platform: Platform.LINKEDIN,
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
      credentialIds: ['cred-x', 'cred-li'],
      timezone: 'America/New_York',
    });
  });
});

describe('useWorkflowActionScope', () => {
  it('falls back through externalHandle, externalName, then label for connected accounts', () => {
    const { result } = renderHook(() => useWorkflowActionScope());

    expect(result.current.connectedAccounts).toEqual([
      {
        id: 'cred-x',
        label: 'VincentShipsIt',
        platform: Platform.TWITTER,
      },
      {
        id: 'cred-li',
        label: 'Vincent Ships It',
        platform: Platform.LINKEDIN,
      },
    ]);
  });
});
