import { EngagementMetric, EngagementRuleAction } from '@genfeedai/contracts';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredRule = { id: string; postGroupId: string; threshold: number };

// In-memory engagement-rules API keyed by post group. `requests` logs every
// list read so the tests can tell a cached render from a real fetch.
const api = vi.hoisted(() => ({
  isSignedIn: true,
  requests: [] as string[],
  rules: [] as StoredRule[],
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isSignedIn: api.isSignedIn }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    findAll: async (params: { postGroupId: string; targetId: string }) => {
      api.requests.push(`${params.postGroupId}/${params.targetId}`);
      return api.rules.filter(
        (rule) => rule.postGroupId === params.postGroupId,
      );
    },
    post: async (input: { postGroupId: string; threshold: number }) => {
      const created = { id: `rule-${api.rules.length + 1}`, ...input };
      api.rules = [...api.rules, created];
      return created;
    },
  }),
}));

vi.mock('@genfeedai/services/content/engagement-rules.service', () => ({
  EngagementRulesService: { getInstance: () => ({}) },
}));

import { useEngagementRules } from './use-engagement-rules';

const RULE = { id: 'rule-1', postGroupId: 'group-1', threshold: 100 };
const TARGET = { postGroupId: 'group-1', targetId: 'target-1' };

describe('useEngagementRules', () => {
  beforeEach(() => {
    api.isSignedIn = true;
    api.requests = [];
    api.rules = [RULE, { id: 'rule-x', postGroupId: 'group-2', threshold: 5 }];
  });

  it('loads engagement rules for the current target', async () => {
    const { result } = renderHook(() => useEngagementRules(TARGET), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.rules).toEqual([RULE]);
    });
    expect(result.current.isLoading).toBe(false);
    expect(api.requests).toEqual(['group-1/target-1']);
  });

  it('does not fetch when signed out', () => {
    api.isSignedIn = false;

    const { result } = renderHook(() => useEngagementRules(TARGET), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.rules).toEqual([]);
    expect(api.requests).toEqual([]);
  });

  it('does not fetch without a post group and target', () => {
    const { result } = renderHook(() => useEngagementRules(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.rules).toEqual([]);
    expect(api.requests).toEqual([]);
  });

  it('refresh picks up rules changed on the server', async () => {
    const { result } = renderHook(() => useEngagementRules(TARGET), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.rules).toEqual([RULE]);
    });

    api.rules = [{ ...RULE, threshold: 250 }];
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.rules).toEqual([{ ...RULE, threshold: 250 }]);
    });
  });

  it('shows a created rule without a manual refresh', async () => {
    const { result } = renderHook(() => useEngagementRules(TARGET), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => {
      expect(result.current.rules).toEqual([RULE]);
    });

    await act(async () => {
      await result.current.create({
        actionType: EngagementRuleAction.REPOST,
        metric: EngagementMetric.LIKES,
        postGroupId: 'group-1',
        targetId: 'target-1',
        threshold: 500,
      });
    });

    await waitFor(() => {
      expect(result.current.rules).toHaveLength(2);
    });
    expect(result.current.rules[1]).toMatchObject({ threshold: 500 });
  });
});
