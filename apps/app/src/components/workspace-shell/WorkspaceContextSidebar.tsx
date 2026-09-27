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
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

type WorkspaceContextSidebarProps = {
  readonly contextSidebar: ContextSidebarContextValue;
};

const OUTLET_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto';

/**
 * Rail variant: an `h-12` header aligned with the topbar, then the outlet the
 * selected page portals its detail into.
 */
export function WorkspaceContextSidebarRail({
  contextSidebar,
}: WorkspaceContextSidebarProps) {
  const translate = useTranslations('common.contextSidebar');
  const { selection } = contextSidebar;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-selection-kind={selection?.kind}
      data-testid="context-sidebar"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="min-w-0">
          <p
            className="truncate text-sm font-medium text-foreground"
            data-testid="context-sidebar-title"
          >
            {selection?.title}
          </p>
          {selection?.subtitle ? (
            <p className="truncate text-xs text-muted-foreground">
              {selection.subtitle}
            </p>
          ) : null}
        </div>
        <Button
          ariaLabel={translate('close')}
          data-testid="context-sidebar-close"
          icon={<X className="size-4" />}
          onClick={contextSidebar.close}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>
      <ContextSidebarOutlet
        className={OUTLET_CLASS_NAME}
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
        <DrawerTitle>{selection?.title ?? translate('label')}</DrawerTitle>
        <DrawerDescription>
          {selection?.subtitle ?? translate('drawerDescription')}
        </DrawerDescription>
      </DrawerHeader>
      <ContextSidebarOutlet
        className={OUTLET_CLASS_NAME}
        target="mobile"
        testId="context-sidebar-drawer-outlet"
      />
    </>
  );
}
