'use client';

import {
  ContextSidebarHeaderOutlet,
  ContextSidebarOutlet,
} from '@contexts/ui/context-sidebar-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ContextSidebarContextValue } from '@genfeedai/props/ui/context-sidebar.props';
import { Button } from '@ui/primitives/button';
import {
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@ui/primitives/drawer';
import { SHELL_CHROME_FOCUS_CLASS } from '@ui-constants/shell-chrome.constant';
import { PanelRight, PanelRightClose } from 'lucide-react';
import { useTranslations } from 'next-intl';

type WorkspaceContextSidebarProps = {
  readonly contextSidebar: ContextSidebarContextValue;
};

type WorkspaceContextSidebarRailProps = WorkspaceContextSidebarProps & {
  /**
   * The host is the app shell: its topbar's Context toggle opens the panel,
   * and the header row repeats that toggle (pressed) so the panel can close
   * from the row it opened beside.
   */
  readonly isTopbarHosted?: boolean;
  readonly target?: 'desktop' | 'mobile';
};

const HEADER_ACTIONS_CLASS_NAME =
  'flex shrink-0 items-center gap-1 empty:hidden';

const OUTLET_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto';

/**
 * Rail variant: the sidebar has exactly one topbar. Standalone hosts (admin)
 * get an `h-12` header here with a collapse button; a host whose panel runs
 * beside the topbar sets `isTopbarHosted` and gets the same `h-12` row, level
 * with the topbar's, holding the title, the header actions and the panel
 * toggle. Then the outlet the selected page portals its detail into.
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
        // One 48px row, level with the topbar's: the selection title on the
        // left, the page's header actions and the panel toggle (pressed, the
        // same icon as the topbar's Context toggle) on the right.
        <div
          className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-2"
          data-testid="context-sidebar-header"
        >
          <div className="min-w-0 px-2">{titleBlock}</div>
          <div className="flex shrink-0 items-center gap-1">
            <ContextSidebarHeaderOutlet
              className={HEADER_ACTIONS_CLASS_NAME}
              target={target}
              testId="context-sidebar-header-actions"
            />
            <Button
              ariaLabel={translate('close')}
              className={SHELL_CHROME_FOCUS_CLASS}
              data-active="true"
              data-testid="context-sidebar-close"
              icon={<PanelRight className="size-4" />}
              onClick={contextSidebar.close}
              size={ButtonSize.ICON}
              tooltip={translate('close')}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
          {titleBlock}
          <div className="flex shrink-0 items-center gap-1">
            <ContextSidebarHeaderOutlet
              className={HEADER_ACTIONS_CLASS_NAME}
              target={target}
              testId="context-sidebar-header-actions"
            />
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

/** Drawer variant for phone widths below `md`: same selection, same content. */
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
          <div className="flex shrink-0 items-center gap-1">
            <ContextSidebarHeaderOutlet
              className={HEADER_ACTIONS_CLASS_NAME}
              target="mobile"
              testId="context-sidebar-drawer-header-actions"
            />
            <Button
              ariaLabel={translate('close')}
              data-testid="context-sidebar-drawer-close"
              icon={<PanelRightClose className="size-4" />}
              onClick={contextSidebar.close}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </div>
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
