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

  it('renders a module route while its flag is on', () => {
    renderGate();

    expect(screen.getByText('module content')).toBeInTheDocument();
  });

  it('answers 404 on a module route whose flag is off', () => {
    state.flags = { studio: false };

    expect(renderGate).toThrow('NEXT_NOT_FOUND');
  });

  it('lets a superadmin open a module that is off', () => {
    state.flags = { studio: false };
    state.isSuperAdmin = true;

    renderGate();

    expect(screen.getByText('module content')).toBeInTheDocument();
  });

  it('blocks disabled Clips creation for regular users', () => {
    state.flags = { studio: false };
    state.pathname = '/acme/brand/studio/clips/new';
    expect(renderGate).toThrow('NEXT_NOT_FOUND');
  });

  it('preserves superadmin inspection of disabled Clips creation', () => {
    state.flags = { studio: false };
    state.isSuperAdmin = true;
    state.pathname = '/acme/brand/studio/clips/new';
    renderGate();
    expect(screen.getByText('module content')).toBeInTheDocument();
  });

  it('answers 404 on a Studio surface whose own flag is off', () => {
    state.flags = { studio: true, studio_motion: false };
    state.pathname = '/acme/brand/studio/motion';

    expect(renderGate).toThrow('NEXT_NOT_FOUND');
  });

  it('keeps other Studio surfaces open when one surface is off', () => {
    state.flags = { studio: true, studio_motion: false };
    state.pathname = '/acme/brand/studio/storyboard/new';

    renderGate();

    expect(screen.getByText('module content')).toBeInTheDocument();
  });

  it('lets a superadmin open a Studio surface that is off', () => {
    state.flags = { studio: true, studio_editor: false };
    state.isSuperAdmin = true;
    state.pathname = '/acme/~/studio/editor/new';

    renderGate();

    expect(screen.getByText('module content')).toBeInTheDocument();
  });

  it('never gates a route outside the flagged modules', () => {
    state.flags = { studio: false };
    state.pathname = '/acme/brand/workspace/overview';

    renderGate();

    expect(screen.getByText('module content')).toBeInTheDocument();
  });
});
