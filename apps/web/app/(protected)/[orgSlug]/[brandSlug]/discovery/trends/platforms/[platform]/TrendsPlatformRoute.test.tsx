/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrendsPlatformRoute from './TrendsPlatformRoute';
import '@testing-library/jest-dom/vitest';

const route = vi.hoisted(() => ({ platform: undefined as string | undefined }));

vi.mock('@genfeedai/hooks/navigation/use-route-params', () => ({
  useRouteParams: () => ({ platform: route.platform }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock(
  '@/components/shell/workspace-frame-skeleton/WorkspaceContentSkeleton',
  () => ({
    default: () => <p>Loading trends</p>,
  }),
);
vi.mock('@/features/trends/platform-detail/trends-platform-detail', () => ({
  default: ({ platform }: { platform: string }) => (
    <h1>Trends on {platform}</h1>
  ),
}));

describe('TrendsPlatformRoute', () => {
  beforeEach(() => {
    route.platform = undefined;
  });

  it('shows the page placeholder in the prerendered shell, before the platform is known', () => {
    render(<TrendsPlatformRoute />);

    expect(screen.getByText('Loading trends')).toBeInTheDocument();
  });

  it('opens the trends of the platform named by the path', () => {
    route.platform = 'tiktok';
    render(<TrendsPlatformRoute />);

    expect(
      screen.getByRole('heading', { name: 'Trends on tiktok' }),
    ).toBeInTheDocument();
  });

  it('is not found for a segment that names no trend platform', () => {
    route.platform = 'myspace';

    expect(() => render(<TrendsPlatformRoute />)).toThrow('NEXT_NOT_FOUND');
  });
});
