// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  availableAppIds: ['workspace', 'agent', 'library'] as string[],
  isLoaded: true,
  isReady: true,
  organizationHomeAppId: null as string | null,
  userHomeAppId: null as string | null,
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    settings: { defaultHomeAppId: state.organizationHomeAppId },
  }),
}));
vi.mock('@/components/shell/rail-preferences.provider', () => ({
  useRailPreferencesContext: () => ({
    homeAppId: state.userHomeAppId,
    isLoaded: state.isLoaded,
  }),
}));
vi.mock('@/components/shell/use-available-rail-apps', () => ({
  useAvailableRailApps: () => ({
    apps: state.availableAppIds.map((id) => ({ id })),
    isReady: state.isReady,
  }),
}));
vi.mock('@ui/shell/app-rail/app-rail.registry', () => ({
  getRailAppRoute: (appId: string, orgSlug: string, brandSlug?: string) =>
    ['workspace', 'agent', 'library', 'turbo'].includes(appId)
      ? `/${orgSlug}/${brandSlug ?? '~'}/${appId}`
      : null,
}));

const { useHomeApp } = await import('./use-home-app');

describe('useHomeApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.availableAppIds = ['workspace', 'agent', 'library'];
    state.isLoaded = true;
    state.isReady = true;
    state.organizationHomeAppId = null;
    state.userHomeAppId = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lands on Workspace when nobody chose anything', () => {
    const { result } = renderHook(() => useHomeApp());
    expect(result.current.appId).toBe('workspace');
    expect(result.current.isResolved).toBe(true);
    expect(result.current.resolveHref('acme', 'moonrise')).toBe(
      '/acme/moonrise/workspace',
    );
  });

  it('prefers the member’s choice, then the organization’s', () => {
    state.organizationHomeAppId = 'library';
    expect(renderHook(() => useHomeApp()).result.current.appId).toBe('library');

    state.userHomeAppId = 'agent';
    expect(renderHook(() => useHomeApp()).result.current.appId).toBe('agent');
  });

  it('skips a choice the member cannot open', () => {
    state.userHomeAppId = 'turbo';
    state.organizationHomeAppId = 'library';
    expect(renderHook(() => useHomeApp()).result.current.appId).toBe('library');

    state.organizationHomeAppId = 'turbo';
    expect(renderHook(() => useHomeApp()).result.current.appId).toBe(
      'workspace',
    );
  });

  it('opens the organization route when no brand is given', () => {
    state.userHomeAppId = 'agent';
    const { result } = renderHook(() => useHomeApp());
    expect(result.current.resolveHref('acme')).toBe('/acme/~/agent');
  });

  it('is unresolved while preferences or availability load', () => {
    state.isLoaded = false;
    expect(renderHook(() => useHomeApp()).result.current.isResolved).toBe(
      false,
    );

    state.isLoaded = true;
    state.isReady = false;
    expect(renderHook(() => useHomeApp()).result.current.isResolved).toBe(
      false,
    );
  });

  it('stops waiting after the timeout so a slow read never blocks landing', () => {
    state.isLoaded = false;
    const { result } = renderHook(() => useHomeApp());
    expect(result.current.isResolved).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(result.current.isResolved).toBe(true);
    expect(result.current.appId).toBe('workspace');
  });
});
