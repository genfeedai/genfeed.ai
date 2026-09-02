'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import LibraryWorkspaceSurfaceAdapter from './library-workspace-surface-adapter';

/**
 * Library surface layout. `/library/assets` is the canonical home — a single
 * unified asset browser. Type routes (videos, images, gifs, avatars, voices,
 * music, captions) survive only as seeded filter presets over that same
 * browser, not separate pages. Sidebar navigation is owned by the shell nav
 * panel in app-protected-layout — not portaled from here — so it never
 * mounts empty. The surface adapter sits here rather than on each route so
 * every library destination projects its selected asset into the same rail.
 */
export default function LibraryLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="library">
      <LibraryWorkspaceSurfaceAdapter />
      {children}
    </FeatureGate>
  );
}
