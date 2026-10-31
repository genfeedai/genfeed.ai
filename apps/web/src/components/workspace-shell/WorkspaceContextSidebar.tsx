'use client';

import { ContextSidebarOutlet } from '@contexts/ui/context-sidebar-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ContextSidebarContextValue } from '@genfeedai/props/ui/context-sidebar.props';
import { Button } from '@ui/primitives/button';
import {
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@ui/primitives/drawer';
import { PanelRightClose, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

type WorkspaceContextSidebarProps = {
  readonly contextSidebar: ContextSidebarContextValue;
};

type WorkspaceContextSidebarRailProps = WorkspaceContextSidebarProps & {
  /**
   * The host already renders the sidebar's one topbar and close control (the
   * workspace panel's tab strip). The rail then shows the selection as plain
   * content instead of a second bar with its own collapse button.
   */
  readonly isTopbarHosted?: boolean;
  readonly target?: 'desktop' | 'mobile';
};

const OUTLET_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto';

/**
 * Rail variant: the sidebar has exactly one topbar. Standalone hosts (admin)
 * get an `h-12` header here; a host with its own topbar sets `isTopbarHosted`
 * and this renders only the selection title as plain content, then the outlet
 * the selected page portals its detail into.
 */
export function WorkspaceContextSidebarRail({
  contextSidebar,
  isTopbarHosted = false,
  target = 'desktop',
}: WorkspaceContextSidebarRailProps) {
  const translate = useTranslations('common.contextSidebar');
  const { selection } = contextSidebar;
  const titleBlock = (
    <div className="min-w-0">
      <p
        className="truncate text-sm font-medium text-foreground"
        data-testid="context-sidebar-title"
      >
        {selection?.title ?? translate('empty')}
      </p>
      {selection?.subtitle ? (
        <p className="truncate text-xs text-muted-foreground">
          {selection.subtitle}
        </p>
      ) : null}
    </div>
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-selection-kind={selection?.kind}
      data-testid="context-sidebar"
    >
      {isTopbarHosted ? (
        <div className="shrink-0 px-4 pb-1 pt-4">{titleBlock}</div>
      ) : (
        <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
          {titleBlock}
          <Button
            ariaLabel={translate('collapse')}
            data-testid="context-sidebar-close"
            icon={<PanelRightClose className="size-4" />}
            onClick={contextSidebar.close}
            size={ButtonSize.SM}
            tooltip={translate('collapse')}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </div>
      )}
      <ContextSidebarOutlet
        className={OUTLET_CLASS_NAME}
        target={target}
        testId="context-sidebar-outlet"
      />
    </div>
  );
}

/** Drawer variant for widths below `xl`: same selection, same content. */
export function WorkspaceContextSidebarDrawerBody({
  contextSidebar,
}: WorkspaceContextSidebarProps) {
  const translate = useTranslations('common.contextSidebar');
  const { selection } = contextSidebar;

  return (
    <>
      <DrawerHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <DrawerTitle>{selection?.title ?? translate('label')}</DrawerTitle>
            <DrawerDescription>
              {selection?.subtitle ?? translate('drawerDescription')}
            </DrawerDescription>
          </div>
          <Button
            ariaLabel={translate('close')}
            data-testid="context-sidebar-drawer-close"
            icon={<X className="size-4" />}
            onClick={contextSidebar.close}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </div>
      </DrawerHeader>
      <ContextSidebarOutlet
        className={OUTLET_CLASS_NAME}
        target="mobile"
        testId="context-sidebar-drawer-outlet"
      />
    </>
  );
}
