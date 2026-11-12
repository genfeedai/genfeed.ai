/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandIndexRedirect from './BrandIndexRedirect';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  params: {} as { brandSlug?: string; orgSlug?: string },
  replace: vi.fn(),
}));

vi.mock('@genfeedai/hooks/navigation/use-route-params', () => ({
  useRouteParams: () => mocks.params,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock(
  '@/components/shell/workspace-frame-skeleton/WorkspaceContentSkeleton',
  () => ({
    default: () => <p>Opening the workspace</p>,
  }),
);

describe('BrandIndexRedirect', () => {
  beforeEach(() => {
    mocks.params = {};
    mocks.replace.mockReset();
  });

  it('shows the page placeholder while the brand address is resolving, without redirecting', () => {
    render(<BrandIndexRedirect />);

    expect(screen.getByText('Opening the workspace')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('lands on the Workspace overview of the brand named by the path', () => {
    mocks.params = { brandSlug: 'FUDNEWS', orgSlug: 'demo' };
    render(<BrandIndexRedirect />);

    expect(mocks.replace).toHaveBeenCalledWith(
      '/demo/FUDNEWS/workspace/overview',
    );
  });
});
