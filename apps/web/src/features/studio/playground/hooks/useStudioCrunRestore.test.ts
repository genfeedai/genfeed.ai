import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioCrunRestore } from '@/features/studio/playground/hooks/useStudioCrunRestore';

const identity = vi.hoisted(() => ({ sessionId: 'session-1' }));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ sessionId: identity.sessionId, userId: 'user-1' }),
}));

describe('useStudioCrunRestore', () => {
  beforeEach(() => {
    identity.sessionId = 'session-1';
  });

  it('starts with no restore in progress', () => {
    const { result } = renderHook(() =>
      useStudioCrunRestore({ brandId: 'brand-1', organizationId: 'org-1' }),
    );

    expect(result.current.crunRestoreStatus).toBeNull();
    expect(result.current.crunRestoreEpochRef.current).toBe(0);
  });

  it('clearing a restore drops its status and fences the in-flight one', () => {
    const { result } = renderHook(() =>
      useStudioCrunRestore({ brandId: 'brand-1', organizationId: 'org-1' }),
    );
    act(() => result.current.setCrunRestoreStatus('pending'));
    expect(result.current.crunRestoreStatus).toBe('pending');

    act(() => result.current.clearCrunRestore());

    expect(result.current.crunRestoreStatus).toBeNull();
    expect(result.current.crunRestoreEpochRef.current).toBe(1);
  });

  it('a scope switch changes the scope and the focused-preview key', () => {
    const { result, rerender } = renderHook(
      ({ brandId }) =>
        useStudioCrunRestore({ brandId, organizationId: 'org-1' }),
      { initialProps: { brandId: 'brand-1' } },
    );
    const firstScope = result.current.crunRestoreScope;
    const firstKey = result.current.focusedScopeKey;

    rerender({ brandId: 'brand-2' });

    expect(result.current.crunRestoreScope).not.toBe(firstScope);
    expect(result.current.focusedScopeKey).not.toBe(firstKey);
    expect(result.current.crunRestoreEpochRef.current).toBe(1);
  });

  it('keeps the scope while nothing about it changes', () => {
    const { result, rerender } = renderHook(() =>
      useStudioCrunRestore({ brandId: 'brand-1', organizationId: 'org-1' }),
    );
    const firstKey = result.current.focusedScopeKey;

    rerender();

    expect(result.current.focusedScopeKey).toBe(firstKey);
    expect(result.current.crunRestoreEpochRef.current).toBe(0);
  });
});
