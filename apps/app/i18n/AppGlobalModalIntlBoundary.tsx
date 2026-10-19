'use client';

import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import type {
  GlobalModalKind,
  GlobalModalRenderer,
} from '@genfeedai/props/modals/global-modals.props';
import type { IntlMessageTree } from '@genfeedai/props/providers/intl-provider.props';
import { usePathname } from 'next/navigation';
import { isValidElement, lazy, Suspense, useState } from 'react';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import AppPageIntlProvider from './AppPageIntlProvider';

function createModalCatalog(load: () => Promise<{ default: IntlMessageTree }>) {
  return lazy(async () => {
    const { default: pages } = await load();
    return {
      default: function ModalCatalog({ children }: LayoutProps) {
        return (
          <AppPageIntlProvider pages={pages}>{children}</AppPageIntlProvider>
        );
      },
    };
  });
}

const CATALOGS = {
  admin: createModalCatalog(() => import('./page-scopes/admin')),
  agent: createModalCatalog(() => import('./page-scopes/agent')),
  analytics: createModalCatalog(() => import('./page-scopes/analytics')),
  'asset-modal': createModalCatalog(() => import('./page-scopes/asset-modal')),
  automation: createModalCatalog(() => import('./page-scopes/automation')),
  'brand-settings': createModalCatalog(
    () => import('./page-scopes/brand-settings'),
  ),
  connect: createModalCatalog(() => import('./page-scopes/connect')),
  discovery: createModalCatalog(() => import('./page-scopes/discovery')),
  library: createModalCatalog(() => import('./page-scopes/library')),
  messages: createModalCatalog(() => import('./page-scopes/messages')),
  onboarding: createModalCatalog(() => import('./page-scopes/onboarding')),
  'organization-settings': createModalCatalog(
    () => import('./page-scopes/organization-settings'),
  ),
  overview: createModalCatalog(() => import('./page-scopes/overview')),
  'personal-settings': createModalCatalog(
    () => import('./page-scopes/personal-settings'),
  ),
  platforms: createModalCatalog(() => import('./page-scopes/platforms')),
  publishing: createModalCatalog(() => import('./page-scopes/publishing')),
  studio: createModalCatalog(() => import('./page-scopes/studio')),
  workspace: createModalCatalog(() => import('./page-scopes/workspace')),
};

type ModalCatalogScope = keyof typeof CATALOGS;

export function resolveModalCatalogScope(
  kind: GlobalModalKind,
  pathname: string | null,
): ModalCatalogScope | undefined {
  if (kind === 'brand' || kind === 'gallery') {
    return 'asset-modal';
  }
  if (kind !== 'confirm') return undefined;
  const area = normalizeProtectedPathname(pathname).split('/')[1];
  if (!area && pathname) return 'workspace';
  if (area === 'settings') {
    const segments = pathname?.split('/').filter(Boolean) ?? [];
    if (segments[1] === '~') return 'organization-settings';
    if (segments[2] === 'settings') return 'brand-settings';
    return 'personal-settings';
  }
  if (area === 'tasks') return 'workspace';
  if (area === 'edit') return 'studio';
  return area && Object.hasOwn(CATALOGS, area)
    ? (area as ModalCatalogScope)
    : undefined;
}

interface AppGlobalModalIntlBoundaryProps extends LayoutProps {
  kind: GlobalModalKind;
}

export default function AppGlobalModalIntlBoundary({
  children,
  kind,
}: AppGlobalModalIntlBoundaryProps) {
  const pathname = usePathname();
  const [scope] = useState(() => resolveModalCatalogScope(kind, pathname));
  if (!scope) return children;
  const Catalog = CATALOGS[scope];
  return (
    <Suspense fallback={null}>
      <Catalog>{children}</Catalog>
    </Suspense>
  );
}

/**
 * The bounded asset catalog (library inspector, tags, brand overview) for a
 * host-owned panel that is not a global modal, such as the ingredient and
 * brand panels in the right context sidebar. Loads only when it mounts.
 */
export function AppAssetCatalogBoundary({ children }: LayoutProps) {
  return (
    <AppGlobalModalIntlBoundary kind="gallery">
      {children}
    </AppGlobalModalIntlBoundary>
  );
}

export const renderAppGlobalModal: GlobalModalRenderer = (kind, children) => (
  <AppGlobalModalIntlBoundary
    key={isValidElement(children) ? children.key : kind}
    kind={kind}
  >
    {children}
  </AppGlobalModalIntlBoundary>
);
