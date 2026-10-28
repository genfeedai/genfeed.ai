// @vitest-environment jsdom

import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkflowModelCatalog } from './useWorkflowModelCatalog';

const mocks = vi.hoisted(() => {
  const findAllPages = vi.fn();
  return {
    findAllPages,
    getService: () => Promise.resolve({ findAllPages }),
    organizationId: 'org-1' as string | undefined,
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.organizationId }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const CATEGORIES = [ModelCategory.IMAGE] as const;

describe('useWorkflowModelCatalog', () => {
  beforeEach(() => {
    mocks.findAllPages.mockReset();
    mocks.organizationId = 'org-1';
  });

  it('loads the organization catalog for the action categories and drops retired rows', async () => {
    mocks.findAllPages.mockResolvedValue([
      { key: 'a', lifecycle: ModelLifecycle.RECOMMENDED },
      { key: 'b', lifecycle: ModelLifecycle.RETIRED },
    ] as IModel[]);

    const { result } = renderHook(() => useWorkflowModelCatalog(CATEGORIES));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models.map((model) => model.key)).toEqual(['a']);
    expect(mocks.findAllPages).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: 'image',
        includeRetired: false,
        organizationId: 'org-1',
      }),
      expect.any(AbortSignal),
    );
  });

  it('reports an error instead of an empty catalog when the request fails', async () => {
    mocks.findAllPages.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useWorkflowModelCatalog(CATEGORIES));

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.models).toEqual([]);
  });

  it('does not request anything without an organization', () => {
    mocks.organizationId = undefined;

    const { result } = renderHook(() => useWorkflowModelCatalog(CATEGORIES));

    expect(result.current.isLoading).toBe(false);
    expect(mocks.findAllPages).not.toHaveBeenCalled();
  });
});
