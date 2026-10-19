'use client';

import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  SIDEBAR_TRANSITION_DURATION_MS,
  SIDEBAR_TRANSITION_EASING,
} from '@ui/layouts/app/app-layout.utils';
import { Drawer, DrawerContent } from '@ui/primitives/drawer';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef } from 'react';
import {
  WorkspaceContextSidebarDrawerBody,
  WorkspaceContextSidebarRail,
} from './WorkspaceContextSidebar';

const ADMIN_SIDEBAR_WIDTH = 384;

/**
 * The right context sidebar for admin pages. The workspace shell mounts it for
 * the app; admin is a separate control plane without that shell, so its tables
 * and details get the same column here: a fixed rail from `xl`, a drawer below.
 * Publishes its width the way the shell does, so the topbar and content panel
 * make room for it.
 */
export default function AdminContextSidebar() {
  const contextSidebar = useContextSidebar();
  const translate = useTranslations('common.contextSidebar');
  const railRef = useRef<HTMLElement>(null);
  const activeSidebar = contextSidebar?.selection ? contextSidebar : null;
  const isOpen = activeSidebar?.isOpen ?? false;

  useLayoutEffect(() => {
    const layoutRoot = railRef.current?.closest<HTMLElement>(
      '[data-shell-chrome="true"]',
    );

    if (!layoutRoot) {
      return;
    }

    layoutRoot.style.setProperty(
      '--workspace-inspector-width',
      `${isOpen ? ADMIN_SIDEBAR_WIDTH : 0}px`,
    );
    layoutRoot.style.setProperty(
      '--workspace-inspector-transition-duration',
      `${SIDEBAR_TRANSITION_DURATION_MS}ms`,
    );
    layoutRoot.dataset.inspectorOpen = String(isOpen);

    return () => {
      layoutRoot.style.removeProperty('--workspace-inspector-width');
      layoutRoot.style.removeProperty(
        '--workspace-inspector-transition-duration',
      );
      delete layoutRoot.dataset.inspectorOpen;
    };
  }, [isOpen]);

  if (!contextSidebar) {
    return null;
  }

  return (
    <>
      <aside
        aria-hidden={activeSidebar ? undefined : true}
        aria-label={translate('label')}
        className={cn(
          'fixed z-30 hidden min-h-0 flex-col overflow-hidden rounded-r-lg bg-background xl:flex',
          isOpen && 'border-y border-r border-border',
        )}
        data-motion="layout"
        inert={!isOpen}
        ref={railRef}
        style={{
          bottom: 'var(--shell-inset, 0px)',
          right: 0,
          top: 'calc(var(--desktop-titlebar-height) + var(--shell-topbar-offset, 0px))',
          transition: `width ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}`,
          width: isOpen ? ADMIN_SIDEBAR_WIDTH : 0,
        }}
      >
        <div
          className="absolute inset-y-0 right-0 flex min-h-0 flex-col"
          style={{ width: ADMIN_SIDEBAR_WIDTH }}
        >
          <div className="flex min-h-0 flex-1 flex-col" hidden={!activeSidebar}>
            <WorkspaceContextSidebarRail contextSidebar={contextSidebar} />
          </div>
        </div>
      </aside>

      <Drawer
        open={activeSidebar?.isMobileOpen ?? false}
        onOpenChange={(isDrawerOpen: boolean) => {
          if (isDrawerOpen) {
            activeSidebar?.setIsMobileOpen(true);
          } else {
            activeSidebar?.close();
          }
        }}
      >
        <DrawerContent className="max-h-[85vh]">
          {activeSidebar ? (
            <WorkspaceContextSidebarDrawerBody contextSidebar={activeSidebar} />
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}
