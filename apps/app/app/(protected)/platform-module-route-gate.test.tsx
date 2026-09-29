import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlatformModuleRouteGate from './platform-module-route-gate';

const state = vi.hoisted(() => ({
  flags: {} as Record<string, boolean>,
  isSuperAdmin: false,
  pathname: '/acme/brand/studio/generate',
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  usePathname: () => state.pathname,
}));

vi.mock('@hooks/feature-flags/provider', () => ({
  useFeatureFlagContext: () => ({ flags: state.flags, isConfigured: true }),
}));

vi.mock('@hooks/auth/use-is-super-admin/use-is-super-admin', () => ({
  useIsSuperAdmin: () => state.isSuperAdmin,
}));

function renderGate() {
  return render(
    <PlatformModuleRouteGate>
      <span>module content</span>
    </PlatformModuleRouteGate>,
  );
}

describe('PlatformModuleRouteGate (#5468)', () => {
  beforeEach(() => {
    state.flags = { studio: true };
    state.isSuperAdmin = false;
    state.pathname = '/acme/brand/studio/generate';
  });

  it('blocks disabled Clips creation for regular users', () => {
    state.flags = { studio: false };
    state.pathname = '/acme/brand/studio/clips/new';
    expect(renderGate).toThrow('NEXT_NOT_FOUND');
  });

  it('never gates a route outside the flagged modules', () => {
    state.flags = { studio: false };
    state.pathname = '/acme/brand/workspace/overview';

    renderGate();

    expect(screen.getByText('module content')).toBeInTheDocument();
  });
});
