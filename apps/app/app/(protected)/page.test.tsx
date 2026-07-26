import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, vi } from 'vitest';
import ProtectedRootPage, * as PageModule from './page';

const mocks = vi.hoisted(() => ({
  betterAuthEnabled: true,
}));

vi.mock('@app/(protected)/root-resolver-client', () => ({
  default: () => <div data-testid="protected-root-resolver" />,
}));

vi.mock('@app/(protected)/home/content', () => ({
  default: () => <main data-testid="operational-home" />,
}));

vi.mock('@genfeedai/auth-client/server', () => ({
  isBetterAuthEnabled: () => mocks.betterAuthEnabled,
}));

runPageModuleTests('app/(protected)/page', PageModule);

describe('ProtectedRootPage', () => {
  beforeEach(() => {
    mocks.betterAuthEnabled = true;
  });

  it('renders the authenticated protected root resolver', () => {
    render(<ProtectedRootPage />);

    expect(screen.getByTestId('protected-root-resolver')).toBeInTheDocument();
  });

  it('renders operational home directly in keyless deployment modes', () => {
    mocks.betterAuthEnabled = false;

    render(<ProtectedRootPage />);

    expect(screen.getByTestId('operational-home')).toBeInTheDocument();
  });
});
