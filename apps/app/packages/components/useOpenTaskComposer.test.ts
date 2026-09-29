import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchOpenTaskComposer, mockPathname, push } = vi.hoisted(() => ({
  dispatchOpenTaskComposer: vi.fn(),
  mockPathname: { value: '/acme/brand/studio/generate' },
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
  useRouter: () => ({ push }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));

vi.mock('@/lib/workspace/task-composer-events', () => ({
  dispatchOpenTaskComposer,
}));

import { useOpenTaskComposer } from './useOpenTaskComposer';

describe('useOpenTaskComposer', () => {
  beforeEach(() => {
    dispatchOpenTaskComposer.mockClear();
    push.mockClear();
  });

  it('navigates to the workspace inbox when the composer is not mounted', () => {
    mockPathname.value = '/acme/brand/studio/generate';
    renderHook(() => useOpenTaskComposer()).result.current();

    expect(dispatchOpenTaskComposer).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/acme/brand/workspace/inbox');
  });

  it('only dispatches when already on the workspace inbox', () => {
    mockPathname.value = '/acme/brand/workspace/inbox';
    renderHook(() => useOpenTaskComposer()).result.current();

    expect(dispatchOpenTaskComposer).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });
});
