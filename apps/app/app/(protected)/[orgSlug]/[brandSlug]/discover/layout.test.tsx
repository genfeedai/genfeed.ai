import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/guards/feature/FeatureGate', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@pages/research/work-surface/ResearchWorkSurfaceProvider', () => ({
  ResearchWorkSurfaceProvider: ({ children }: PropsWithChildren) => (
    <div data-testid="research-provider">{children}</div>
  ),
}));

vi.mock('@pages/research/remix/DiscoverRemixProvider', () => ({
  DiscoverRemixProvider: ({ children }: PropsWithChildren) => (
    <div data-testid="remix-provider">{children}</div>
  ),
}));

vi.mock(
  '@app-components/research/work-surface/ResearchWorkspaceSurfaceAdapter',
  () => ({ default: () => <div>Research adapter</div> }),
);

vi.mock('@app-components/research/remix/RemixBriefInspector', () => ({
  default: () => <div>Remix brief inspector</div>,
}));

import DiscoverLayout from './layout';

describe('DiscoverLayout', () => {
  it('mounts one shared remix provider and inspector around every Discover route', () => {
    render(
      <DiscoverLayout>
        <div>Discover content</div>
      </DiscoverLayout>,
    );

    expect(screen.getByTestId('remix-provider')).toContainElement(
      screen.getByText('Discover content'),
    );
    expect(screen.getByText('Remix brief inspector')).toBeVisible();
  });
});
