import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchOpenTaskComposer, push } = vi.hoisted(() => ({
  dispatchOpenTaskComposer: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/brand/publishing/review',
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

  it('opens the composer on the current page', () => {
    renderHook(() => useOpenTaskComposer()).result.current();

    expect(dispatchOpenTaskComposer).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });
});
