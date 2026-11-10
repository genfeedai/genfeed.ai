// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  hasAppsBeyondDashboard: false,
  settingsLoading: false,
}));
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
);

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ settingsLoading: state.settingsLoading }),
}));

vi.mock('@/components/shell/use-available-rail-apps', () => ({
  useHasAppsBeyondDashboard: () => state.hasAppsBeyondDashboard,
}));

vi.mock('next/navigation', () => ({ notFound }));

import ModulesRouteGate from './modules-route-gate';

describe('ModulesRouteGate', () => {
  beforeEach(() => {
    state.hasAppsBeyondDashboard = false;
    state.settingsLoading = false;
    notFound.mockClear();
  });

  it('serves the page when an app beyond the core is available', () => {
    state.hasAppsBeyondDashboard = true;

    render(
      <ModulesRouteGate>
        <p>Modules</p>
      </ModulesRouteGate>,
    );

    expect(screen.getByText('Modules')).toBeInTheDocument();
  });

  it('renders nothing while organization settings load', () => {
    state.settingsLoading = true;

    render(
      <ModulesRouteGate>
        <p>Modules</p>
      </ModulesRouteGate>,
    );

    expect(screen.queryByText('Modules')).not.toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('shows the not-found state when only the core apps are available', () => {
    expect(() =>
      render(
        <ModulesRouteGate>
          <p>Modules</p>
        </ModulesRouteGate>,
      ),
    ).toThrow('NEXT_NOT_FOUND');
  });
});
