// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssetGateGuard from './asset-gate-guard';

const mockAccessState = vi.hoisted(() => ({
  dismissAssetGate: vi.fn(),
  isAssetGateLocked: false,
}));

const mockPathname = vi.hoisted(() => ({
  value: '/acme/brand-x/library/ingredients',
}));

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => mockAccessState,
  }),
);

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    brandSlug: '',
    href: (path: string) => path,
    orgHref: (path: string) => `/acme/~${path}`,
    orgSlug: 'acme',
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}));

describe('AssetGateGuard', () => {
  beforeEach(() => {
    mockAccessState.isAssetGateLocked = false;
    mockAccessState.dismissAssetGate = vi.fn().mockResolvedValue(undefined);
    mockPathname.value = '/acme/brand-x/library/ingredients';
  });

  it('renders children when the asset gate is not locked', () => {
    render(
      <AssetGateGuard>
        <div data-testid="protected-child">Protected content</div>
      </AssetGateGuard>,
    );

    expect(screen.getByTestId('protected-child')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Generate your first asset to unlock',
      }),
    ).not.toBeInTheDocument();
  });

  it('renders children on a non-gated section even while locked', () => {
    mockAccessState.isAssetGateLocked = true;
    mockPathname.value = '/acme/brand-x/agent';

    render(
      <AssetGateGuard>
        <div data-testid="protected-child">Protected content</div>
      </AssetGateGuard>,
    );

    expect(screen.getByTestId('protected-child')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Generate your first asset to unlock',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows the teaser and hides children on a gated section while locked', () => {
    mockAccessState.isAssetGateLocked = true;
    mockPathname.value = '/acme/brand-x/library/ingredients';

    render(
      <AssetGateGuard>
        <div data-testid="protected-child">Protected content</div>
      </AssetGateGuard>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Generate your first asset to unlock',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
  });

  it('dismisses the gate when clicking "Explore anyway"', () => {
    mockAccessState.isAssetGateLocked = true;
    mockPathname.value = '/acme/brand-x/library/ingredients';

    render(
      <AssetGateGuard>
        <div data-testid="protected-child">Protected content</div>
      </AssetGateGuard>,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Explore the app without generating an asset first',
      }),
    );

    expect(mockAccessState.dismissAssetGate).toHaveBeenCalledTimes(1);
  });
});
