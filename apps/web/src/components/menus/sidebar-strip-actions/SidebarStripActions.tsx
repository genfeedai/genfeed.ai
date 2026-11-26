'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { SHELL_CHROME_FOCUS_CLASS } from '@ui-constants/shell-chrome.constant';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useOpenTaskComposer } from '@/components/layouts/protected/useOpenTaskComposer';
import SidebarActionTrigger from '@/components/menus/sidebar-action-trigger/SidebarActionTrigger';
import { useCommandPalette } from '@/hooks/ui/use-command-palette/use-command-palette';
import { useIsDesktopClient } from '@/hooks/ui/use-is-desktop-client/use-is-desktop-client';

type SidebarStripActionsProps = {
  /**
   * `row`: a New Task row and a Search icon, filling the strip. `icons`: two
   * icons for the end of a strip that already holds the macOS window controls.
   */
  layout: 'row' | 'icons';
};

/**
 * New Task and Search, in the 48px strip at the top of the module menu, level
 * with the topbar. The mobile drawer has no strip and keeps them as rows in
 * the menu body.
 */
export default function SidebarStripActions({
  layout,
}: SidebarStripActionsProps) {
  const translate = useTranslations('common.sidebar');
  const openTaskComposer = useOpenTaskComposer();
  const { open: openCommandPalette } = useCommandPalette();
  // Browsers reserve ⌘⇧N (incognito window), so only the desktop app has it.
  const isDesktop = useIsDesktopClient();
  const newTaskShortcut = isDesktop ? '⌘⇧N' : undefined;
  const searchLabel = translate('search');

  const searchButton = (
    <Button
      type="button"
      variant={ButtonVariant.GHOST}
      size={ButtonSize.ICON}
      className={cn('size-8 shrink-0', SHELL_CHROME_FOCUS_CLASS)}
      ariaLabel={searchLabel}
      data-testid="sidebar-strip-search"
      onClick={openCommandPalette}
      tooltip={`${searchLabel} ⌘K`}
      withWrapper={false}
    >
      <Search className="size-4" />
    </Button>
  );

  if (layout === 'icons') {
    return (
      <div
        className="ml-auto flex shrink-0 items-center gap-0.5 pr-2"
        data-testid="sidebar-strip-actions"
      >
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          className={cn('size-8', SHELL_CHROME_FOCUS_CLASS)}
          ariaLabel={translate('newTaskAriaLabel')}
          data-testid="sidebar-primary-action"
          onClick={openTaskComposer}
          tooltip={
            newTaskShortcut
              ? `${translate('newTask')} ${newTaskShortcut}`
              : translate('newTask')
          }
          withWrapper={false}
        >
          <Plus className="size-4" />
        </Button>
        {searchButton}
      </div>
    );
  }

  return (
    <div
      className="flex w-full min-w-0 items-center gap-1 px-2"
      data-testid="sidebar-strip-actions"
    >
      <div className="min-w-0 flex-1">
        <SidebarActionTrigger
          ariaLabel={translate('newTaskAriaLabel')}
          icon={<Plus className="size-4 flex-shrink-0" />}
          label={translate('newTask')}
          onClick={openTaskComposer}
          shortcut={newTaskShortcut}
          testId="sidebar-primary-action"
        />
      </div>
      {searchButton}
    </div>
  );
}
