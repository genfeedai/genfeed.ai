/* @vitest-environment jsdom */

import { Platform } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlatformHomeRoute from './PlatformHomeRoute';
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
    default: () => <p>Loading platform</p>,
  }),
);
vi.mock('./content', () => ({
  default: ({ platform }: { platform: string }) => (
    <div>Mocked platform home: {platform}</div>
  ),
}));

describe('PlatformHomeRoute', () => {
  beforeEach(() => {
    route.platform = undefined;
  });

  it('shows the page placeholder in the prerendered shell, before the platform is known', () => {
    render(<PlatformHomeRoute />);

    expect(screen.getByText('Loading platform')).toBeInTheDocument();
  });

  it('renders a valid credential platform route', () => {
    route.platform = 'instagram';
    render(<PlatformHomeRoute />);

    expect(
      screen.getByText('Mocked platform home: instagram'),
    ).toBeInTheDocument();
  });

  it('normalizes aliases onto the canonical platform', () => {
    route.platform = 'x';
    render(<PlatformHomeRoute />);

    expect(
      screen.getByText(`Mocked platform home: ${Platform.TWITTER}`),
    ).toBeInTheDocument();
  });

  it('is not found for a segment that names no platform', () => {
    route.platform = 'not-a-platform';

    expect(() => render(<PlatformHomeRoute />)).toThrow('NEXT_NOT_FOUND');
  });
});
