import { cleanup, render, screen } from '@testing-library/react';
import { Bell, Settings, Sparkles, Trash2 } from 'lucide-react';
import { createElement, Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ANIMATED_ICON_COUNT,
  ANIMATED_ICON_LOADERS,
  findAnimatedIcon,
  preloadAnimatedIcon,
} from './animated-icon.registry';
import type { AnimatedIconComponent } from './animated-icon.types';

describe('animated icon registry', () => {
  it('maps a lucide icon to its animated twin and nothing else', () => {
    expect(findAnimatedIcon(Bell)).toBeDefined();
    expect(findAnimatedIcon(Sparkles)).toBeDefined();
    expect(findAnimatedIcon(Settings)).toBeDefined();
    expect(findAnimatedIcon(Trash2)).toBeUndefined();
    expect(findAnimatedIcon(() => null)).toBeUndefined();
    expect(findAnimatedIcon(undefined)).toBeUndefined();
  });

  it('treats lucide aliases as the same icon', async () => {
    const { Home, House, CircleHelp, CircleQuestionMark } = await import(
      'lucide-react'
    );

    expect(findAnimatedIcon(Home)).toBe(findAnimatedIcon(House));
    expect(findAnimatedIcon(CircleHelp)).toBe(
      findAnimatedIcon(CircleQuestionMark),
    );
    expect(findAnimatedIcon(House)).toBeDefined();
  });

  it('registers one animated icon per copied component', async () => {
    const files = Object.keys(
      import.meta.glob('./icons/*.tsx', { eager: false }),
    );

    expect(files).toHaveLength(ANIMATED_ICON_COUNT);
  });

  it('loads every animated icon into a renderable component', async () => {
    const loaders = import.meta.glob('./icons/*.tsx');
    const modules = await Promise.all(
      Object.values(loaders).map((load) => load()),
    );

    for (const module of modules) {
      const exported = Object.values(module as Record<string, unknown>);
      // forwardRef components are objects, so check for a render function.
      expect(
        exported.some(
          (value) =>
            typeof value === 'object' &&
            value !== null &&
            '$$typeof' in value &&
            'render' in value,
        ),
      ).toBe(true);
    }
  });

  it('resolves every registry entry to the component its file exports', async () => {
    for (const [, load] of ANIMATED_ICON_LOADERS) {
      const { default: component } = await load();

      expect(component).toBeDefined();
    }
  });

  it('preloads a twin without rendering it, and ignores other icons', async () => {
    await expect(preloadAnimatedIcon(Bell)).resolves.toBeUndefined();
    await expect(preloadAnimatedIcon(Trash2)).resolves.toBeUndefined();
    await expect(preloadAnimatedIcon(undefined)).resolves.toBeUndefined();
  });
});

const BellStub: AnimatedIconComponent = () =>
  createElement('svg', { 'aria-label': 'Animated bell', role: 'img' });

describe('animated icon loading', () => {
  // The Bell twin is replaced by a controlled module. Reading its export is
  // what a loader invocation does, so `exportReads` counts loads and
  // `isChunkFailing` makes the next one reject.
  const loadState = { exportReads: 0, isChunkFailing: false };

  async function importFreshRegistry() {
    const registry = await import('./animated-icon.registry');
    const { Bell: FreshBell } = await import('lucide-react');
    const Twin = registry.findAnimatedIcon(FreshBell);
    if (!Twin) {
      throw new Error('Bell has no animated twin');
    }
    return { Bell: FreshBell, Twin, ...registry };
  }

  function renderTwin(Twin: AnimatedIconComponent) {
    return render(
      createElement(Suspense, { fallback: null }, createElement(Twin)),
    );
  }

  beforeEach(() => {
    loadState.exportReads = 0;
    loadState.isChunkFailing = false;
    vi.resetModules();
    vi.doMock('./icons/bell', () => ({
      get BellIcon() {
        loadState.exportReads += 1;
        if (loadState.isChunkFailing) {
          throw new Error('chunk failed to load');
        }
        return BellStub;
      },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.doUnmock('./icons/bell');
    vi.resetModules();
  });

  it('starts loading the twin when it is preloaded, before any icon renders', async () => {
    const registry = await importFreshRegistry();

    await registry.preloadAnimatedIcon(registry.Bell);

    expect(loadState.exportReads).toBe(1);
    expect(screen.queryByRole('img', { name: 'Animated bell' })).toBeNull();
  });

  it('shares one load when the icon renders while its preload is pending', async () => {
    const registry = await importFreshRegistry();

    const preloading = registry.preloadAnimatedIcon(registry.Bell);
    renderTwin(registry.Twin);
    await preloading;

    expect(
      await screen.findByRole('img', { name: 'Animated bell' }),
    ).toBeVisible();
    expect(loadState.exportReads).toBe(1);
  });

  it('shares one load when preload starts while the icon is still loading', async () => {
    const registry = await importFreshRegistry();

    renderTwin(registry.Twin);
    const preloading = registry.preloadAnimatedIcon(registry.Bell);
    await preloading;

    expect(
      await screen.findByRole('img', { name: 'Animated bell' }),
    ).toBeVisible();
    expect(loadState.exportReads).toBe(1);
  });

  it('retries the load after a failed attempt instead of caching the failure', async () => {
    const registry = await importFreshRegistry();
    loadState.isChunkFailing = true;

    await expect(
      registry.preloadAnimatedIcon(registry.Bell),
    ).resolves.toBeUndefined();
    expect(loadState.exportReads).toBe(1);

    loadState.isChunkFailing = false;
    renderTwin(registry.Twin);

    expect(
      await screen.findByRole('img', { name: 'Animated bell' }),
    ).toBeVisible();
    expect(loadState.exportReads).toBe(2);
  });
});
