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

vi.mock('@pages/research/remix/DiscoveryRemixProvider', () => ({
  DiscoveryRemixProvider: ({ children }: PropsWithChildren) => (
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

import DiscoveryLayout from './layout';

describe('DiscoveryLayout', () => {
  it('mounts one shared remix provider and inspector around every Discovery route', () => {
    render(
      <DiscoveryLayout>
        <div>Discovery content</div>
      </DiscoveryLayout>,
    );

    expect(screen.getByTestId('remix-provider')).toContainElement(
      screen.getByText('Discovery content'),
    );
    expect(screen.getByText('Remix brief inspector')).toBeVisible();
  });
});
