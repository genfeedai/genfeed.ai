'use client';

import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuSharedProps } from '@genfeedai/props/navigation/menu.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Kbd } from '@genfeedai/ui';

import MenuItem from '@ui/menus/item/MenuItem';
import SidebarNested from '@ui/menus/sidebar-nested/SidebarNested';
import WorkspaceSwitcher from '@ui/menus/workspace-switcher/WorkspaceSwitcher';
import { Button } from '@ui/primitives/button';
import { AppSwitcher } from '@ui/shell/app-switcher/AppSwitcher';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiOutlineArrowLeft, HiPlus } from 'react-icons/hi2';
import CollapsibleGroup from './CollapsibleGroup';
import DrillDownGroupRow from './DrillDownGroupRow';
import SidebarUserProfile from './SidebarUserProfile';
import WorkspaceInboxMenuItem from './WorkspaceInboxMenuItem';

/** Single-column sidebar width */
const SIDEBAR_WIDTH = 240;

export default function MenuShared({
  config,
  currentApp,
  onClose,
  renderTopSlot,
  renderBody,
  renderAfterNavigation,
  backHref,
  backLabel,
  sectionLabel,
  isCollapsed,
  shellChromeVariant = 'default',
  onToggleCollapse,
  showPrimaryItems = true,
  conversationActions,
  renderFooterSlot,
}: MenuSharedProps) {
  const logoUrl = useThemeLogo();
  const rawPathname = usePathname();
  const { push } = useRouter();
  const { href, orgHref, orgSlug, brandSlug } = useOrgUrl();
  const [isConversationsCollapsed, setIsConversationsCollapsed] =
    useState(false);
  const { nestedGroupId, enterNestedGroup, exitNestedGroup } =
    useSidebarNavigation();
  const routeScope = useMemo(() => {
    const parts = rawPathname.split('/').filter(Boolean);

    if (parts[0] === 'settings') {
      return 'personal' as const;
    }

    if (parts[1] === '~') {
      return 'organization' as const;
    }

    return 'brand' as const;
  }, [rawPathname]);

  /** Strip org/brand prefix so we can compare against config-level paths. */
  const pathname = useMemo(() => {
    const parts = rawPathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[1] === '~') {
      return `/${parts.slice(2).join('/')}`;
    }
    if (parts.length >= 3) {
      return `/${parts.slice(2).join('/')}`;
    }
    return rawPathname;
  }, [rawPathname]);

  const isAlreadyScopedHref = useCallback(
    (path: string) => {
      const parts = path.split('/').filter(Boolean);

      return (
        parts[0] === orgSlug &&
        (parts[1] === '~' || (brandSlug && parts[1] === brandSlug))
      );
    },
    [brandSlug, orgSlug],
  );

  const resolveLegacySettingsHref = useCallback(
    (path: string) => {
      if (path === '/settings/personal') {
        return '/settings';
      }

      if (path === '/settings/organization') {
        return orgHref('/settings');
      }

      if (path.startsWith('/settings/organization/')) {
        return orgHref(path.replace('/settings/organization', '/settings'));
      }

      if (path.startsWith('/settings/brands/')) {
        const [, , , routeBrandSlug, ...rest] = path.split('/');

        if (routeBrandSlug) {
          const suffix = rest.length > 0 ? `/${rest.join('/')}` : '';
          return `/${orgSlug}/${routeBrandSlug}/settings${suffix}`;
        }
      }

      return orgHref(path);
    },
    [orgHref, orgSlug],
  );

  /** Prefix a config-level path with the configured route scope. */
  const prefixHref = useCallback(
    (
      item:
        | MenuItemConfig
        | { href: string; hrefScope?: MenuItemConfig['hrefScope'] },
    ) => {
      const path = item.href;

      if (!path) {
        return undefined;
      }

      if (isAlreadyScopedHref(path)) {
        return path;
      }

      if (item.hrefScope === 'personal') {
        return path;
      }

      if (item.hrefScope === 'organization') {
        return resolveLegacySettingsHref(path);
      }

      if (item.hrefScope === 'brand') {
        return href(path);
      }

      if (path.startsWith('/settings')) {
        return resolveLegacySettingsHref(path);
      }

      return href(path);
    },
    [href, isAlreadyScopedHref, resolveLegacySettingsHref],
  );

  const primaryItems = useMemo(
    () => config.items.filter((item) => item.isPrimary),
    [config.items],
  );

  const navigationItems = useMemo(
    () => config.items.filter((item) => !item.isPrimary),
    [config.items],
  );

  const secondaryItems = useMemo(
    () => config.secondaryItems ?? [],
    [config.secondaryItems],
  );

  const isActive = useCallback(
    (href: string) => {
      if (!href) {
        return false;
      }

      if (href.startsWith('/elements/') && pathname?.startsWith('/elements/')) {
        return true;
      }
      if (
        href.startsWith('/ingredients/') &&
        pathname?.startsWith('/ingredients/')
      ) {
        return true;
      }

      return pathname === href || pathname?.startsWith(href);
    },
    [pathname],
  );

  const isActiveItem = useCallback(
    (item: MenuItemConfig) => {
      if (!item.href) {
        return false;
      }

      if (item.hrefScope && item.hrefScope !== routeScope) {
        return false;
      }

      return isActive(item.href);
    },
    [isActive, routeScope],
  );

  // Group items by their group field, preserving order
  const groupedItems = useMemo(() => {
    const groups: { group: string; items: MenuItemConfig[] }[] = [];
    let currentGroup: string | undefined;

    navigationItems.forEach((item) => {
      const group = item.group ?? '';
      if (group !== currentGroup) {
        currentGroup = group;
        groups.push({ group, items: [item] });
      } else {
        groups[groups.length - 1].items.push(item);
      }
    });

    return groups;
  }, [navigationItems]);

  const topLevelGroups = useMemo(
    () => groupedItems.filter((group) => group.group === ''),
    [groupedItems],
  );

  const sectionGroups = useMemo(
    () => groupedItems.filter((group) => group.group !== ''),
    [groupedItems],
  );

  const handleLinkClick = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  const renderGroupedItems = useCallback(
    (groups: { group: string; items: MenuItemConfig[] }[]) => (
      <>
        {groups.map((group, groupIndex) => (
          <div key={group.group || `ungrouped-${groupIndex}`}>
            {group.items[0]?.hasDividerAbove && (
              <div className="my-2 border-t border-border" />
            )}
            <CollapsibleGroup
              label={group.group}
              isDrillDown={group.items[0]?.drillDown === true}
            >
              {group.items[0]?.drillDown ? (
                <DrillDownGroupRow
                  group={group}
                  isActive={group.items.some((item) => isActiveItem(item))}
                  defaultHref={prefixHref(group.items[0])}
                  onEnter={() => enterNestedGroup(group.group)}
                />
              ) : (
                <ul className="flex flex-col gap-px">
                  {group.items.map((item, index) => {
                    const itemHref = prefixHref(item);
                    const itemKey = itemHref ?? `${item.label}-${index}`;

                    return item.href?.startsWith('/workspace/inbox') ? (
                      <WorkspaceInboxMenuItem
                        key={itemKey}
                        href={itemHref}
                        isActive={isActiveItem(item)}
                        isComingSoon={item.isComingSoon}
                        label={item.label}
                        onClick={handleLinkClick}
                        outline={item.outline}
                        solid={item.solid}
                      />
                    ) : (
                      <MenuItem
                        key={itemKey}
                        href={itemHref}
                        label={item.label}
                        icon={item.icon}
                        outline={item.outline}
                        solid={item.solid}
                        isActive={isActiveItem(item)}
                        isComingSoon={item.isComingSoon}
                        onClick={handleLinkClick}
                        variant="icon"
                        isCollapsed={false}
                      />
                    );
                  })}
                </ul>
              )}
            </CollapsibleGroup>
          </div>
        ))}
      </>
    ),
    [enterNestedGroup, handleLinkClick, isActiveItem, prefixHref],
  );

  // Get the nested group (for SidebarNested)
  const nestedGroup = useMemo(() => {
    if (!nestedGroupId) {
      return null;
    }
    return groupedItems.find((g) => g.group === nestedGroupId) ?? null;
  }, [groupedItems, nestedGroupId]);

  // Keyboard: Escape exits nested view
  useEffect(() => {
    if (!nestedGroupId) {
      return;
    }

    const processKeyDownMenuShared = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitNestedGroup();
      }
    };

    document.addEventListener('keydown', processKeyDownMenuShared);
    return () =>
      document.removeEventListener('keydown', processKeyDownMenuShared);
  }, [nestedGroupId, exitNestedGroup]);

  const secondaryNavigationContent =
    secondaryItems.length > 0 ? (
      <div
        data-testid="sidebar-secondary-items"
        className="mt-3 border-t border-border pt-2"
      >
        <ul className="flex flex-col gap-px">
          {secondaryItems.map((item, index) => {
            const itemHref = prefixHref(item);

            return (
              <MenuItem
                key={itemHref ?? `${item.label}-${index}`}
                href={itemHref}
                label={item.label}
                icon={item.icon}
                outline={item.outline}
                solid={item.solid}
                isActive={isActiveItem(item)}
                isComingSoon={item.isComingSoon}
                onClick={handleLinkClick}
                variant="icon"
                isCollapsed={false}
              />
            );
          })}
        </ul>
      </div>
    ) : null;

  const topLevelGroupsContent = renderGroupedItems(topLevelGroups);
  const sectionGroupsContent = renderGroupedItems(sectionGroups);
  const allGroupsContent = renderGroupedItems(groupedItems);
  const topSlotContent = renderTopSlot ? renderTopSlot() : null;
  const bodyContent = renderBody ? renderBody() : null;
  const afterNavigationContent = renderAfterNavigation
    ? renderAfterNavigation()
    : null;
  const footerSlotContent = renderFooterSlot ? renderFooterSlot() : null;

  const navigationContent = (
    <>
      {backHref && (
        <div className="pb-1">
          <Link
            href={prefixHref({ href: backHref }) ?? backHref}
            className={cn(
              'group flex h-7 w-full items-center gap-2 rounded px-2.5 py-1 transition-colors duration-150',
              'text-foreground/72 hover:bg-white/[0.035] hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
            )}
            aria-label={`Back to ${backLabel ?? 'previous page'}`}
          >
            <HiOutlineArrowLeft className="size-4 text-foreground/42 transition-colors duration-200 group-hover:text-foreground/78" />
            <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground/88">
              {backLabel ?? 'Back'}
            </span>
          </Link>
        </div>
      )}
      {sectionLabel ? (
        <>
          {topLevelGroupsContent}
          {sectionGroups.length > 0 ? (
            <CollapsibleGroup
              label={sectionLabel}
              isDrillDown={false}
              storageKey={`__${sectionLabel.toLowerCase()}__`}
            >
              {sectionGroupsContent}
            </CollapsibleGroup>
          ) : null}
        </>
      ) : (
        allGroupsContent
      )}
    </>
  );

  const sharedCollapseControl = onToggleCollapse ? (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onToggleCollapse}
      className="flex size-7 flex-shrink-0 items-center justify-center rounded-md bg-transparent text-foreground/72 cursor-pointer transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      ariaLabel={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      <span className="relative flex size-4 items-center justify-center">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={EnvironmentService.LOGO_ALT}
            className="size-4 object-contain dark:invert"
            width={16}
            height={16}
            sizes="16px"
          />
        ) : (
          <span className="text-sm font-bold leading-none">G</span>
        )}
      </span>
    </Button>
  ) : null;

  /* ── Single DOM tree: content fades out, parent clips via overflow:hidden ── */
  return (
    <div
      data-testid="sidebar-shell"
      className={cn(
        'flex h-full min-h-0 flex-1 flex-shrink-0',
        shellChromeVariant === 'transparent'
          ? 'bg-transparent'
          : 'bg-background',
      )}
      style={{
        minWidth: SIDEBAR_WIDTH,
        width: SIDEBAR_WIDTH,
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          data-testid="sidebar-header-shell"
          className={cn(
            'flex h-12 flex-shrink-0 items-center gap-1.5 px-2',
            shellChromeVariant === 'default' && 'border-b border-border',
          )}
        >
          {sharedCollapseControl}
          <WorkspaceSwitcher />
          {currentApp && orgSlug && (
            <AppSwitcher
              currentApp={currentApp}
              orgSlug={orgSlug}
              brandSlug={brandSlug}
            />
          )}
        </div>

        {/* Body — fades out when collapsed, pointer-events disabled */}
        <div
          className={cn(
            'flex-1 flex flex-col min-h-0 transition-opacity duration-200',
            isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100',
          )}
        >
          {topSlotContent ? (
            <div className="px-3 pt-2">{topSlotContent}</div>
          ) : null}

          {/* Primary actions */}
          {showPrimaryItems && config.primaryAction ? (
            <div className="px-3 pt-2 pb-1">
              {config.primaryAction.href ? (
                <Link
                  data-testid="sidebar-primary-action"
                  href={
                    prefixHref(config.primaryAction) ??
                    config.primaryAction.href
                  }
                  onClick={handleLinkClick}
                  className="flex h-9 w-full items-center gap-3 rounded-md border border-border bg-background-secondary px-3 py-1.5 text-left text-xs font-semibold transition-colors hover:border-border-strong hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  data-tone="accent"
                >
                  {config.primaryAction.icon ? (
                    config.primaryAction.icon
                  ) : config.primaryAction.solid ? (
                    <config.primaryAction.solid className="size-4" />
                  ) : config.primaryAction.outline ? (
                    <config.primaryAction.outline className="size-4" />
                  ) : (
                    <HiPlus className="size-4" />
                  )}
                  <span className="flex-1">{config.primaryAction.label}</span>
                  <Kbd
                    variant="subtle"
                    size="xs"
                    className="bg-black/10 text-black/52"
                  >
                    {'⌘⇧'}N
                  </Kbd>
                </Link>
              ) : (
                <Button
                  data-testid="sidebar-primary-action"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={() => {
                    handleLinkClick();
                    config.primaryAction?.onClick?.();
                  }}
                  className="flex h-9 w-full items-center gap-3 rounded-md border border-border bg-background-secondary px-3 py-1.5 text-left text-xs font-semibold transition-colors hover:border-border-strong hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  data-tone="accent"
                >
                  {config.primaryAction.icon ? (
                    config.primaryAction.icon
                  ) : config.primaryAction.solid ? (
                    <config.primaryAction.solid className="size-4" />
                  ) : config.primaryAction.outline ? (
                    <config.primaryAction.outline className="size-4" />
                  ) : (
                    <HiPlus className="size-4" />
                  )}
                  <span className="flex-1">{config.primaryAction.label}</span>
                  <Kbd
                    variant="subtle"
                    size="xs"
                    className="bg-black/10 text-black/52"
                  >
                    {'⌘⇧'}N
                  </Kbd>
                </Button>
              )}
            </div>
          ) : showPrimaryItems && primaryItems.length > 0 ? (
            <div className="px-3 pt-2 pb-1">
              <ul className="flex flex-col gap-1">
                {primaryItems.map((item, index) => {
                  const itemHref = prefixHref(item);

                  return (
                    <MenuItem
                      key={itemHref ?? `${item.label}-${index}`}
                      href={itemHref}
                      label={item.label}
                      icon={item.icon}
                      outline={item.outline}
                      solid={item.solid}
                      isActive={isActiveItem(item)}
                      isComingSoon={item.isComingSoon}
                      onClick={handleLinkClick}
                      variant="icon"
                      isCollapsed={false}
                    />
                  );
                })}
              </ul>
            </div>
          ) : null}

          {bodyContent ? (
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
              {bodyContent}
            </div>
          ) : nestedGroup && nestedGroupId ? (
            <div
              className="flex-1 overflow-hidden"
              style={{
                animation:
                  'slideInFromRight 300ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
            >
              <style>{`
            @keyframes slideInFromRight {
              from { opacity: 0; transform: translateX(8px); }
              to { opacity: 1; transform: translateX(0); }
            }
          `}</style>
              <SidebarNested
                groupLabel={nestedGroup.group}
                backLabel="Workspace"
                items={nestedGroup.items}
                onBack={() => {
                  exitNestedGroup();
                  push(href('/workspace/overview'));
                }}
                onItemClick={handleLinkClick}
              />
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col">
                <div
                  data-testid="sidebar-navigation-section"
                  className={cn(
                    renderAfterNavigation
                      ? 'shrink-0 px-3 pb-2'
                      : 'flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 pb-2',
                  )}
                >
                  {navigationContent}
                  {secondaryNavigationContent}
                </div>

                {afterNavigationContent && (
                  <div
                    data-testid="sidebar-conversations-section"
                    className={cn(
                      'px-3 pb-2 pt-2',
                      !isConversationsCollapsed &&
                        'flex min-h-0 flex-1 flex-col',
                    )}
                  >
                    <CollapsibleGroup
                      label="Conversations"
                      isDrillDown={false}
                      storageKey="__conversations__"
                      actions={conversationActions}
                      className={cn(
                        'mt-0',
                        !isConversationsCollapsed &&
                          'flex min-h-0 flex-1 flex-col',
                      )}
                      contentClassName={cn(
                        !isConversationsCollapsed &&
                          'flex min-h-0 flex-1 flex-col',
                      )}
                      onCollapsedChange={setIsConversationsCollapsed}
                    >
                      <div className="pb-1">
                        <Link
                          href={orgHref('/chat/new')}
                          className="group flex h-8 w-full items-center gap-3 rounded px-3 py-1.5 text-left text-foreground/72 transition-colors duration-150 cursor-pointer hover:bg-white/[0.035] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                          <HiPlus className="size-4 text-foreground/42 group-hover:text-foreground/78" />
                          <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground/88">
                            New Chat
                          </span>
                          <Kbd
                            variant="ghost"
                            className="ml-auto rounded-md border border-border bg-white/[0.03] text-[10px] text-foreground/36 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                          >
                            ⌘⇧N
                          </Kbd>
                        </Link>
                      </div>
                      <div
                        className={cn(
                          !isConversationsCollapsed && 'min-h-0 flex-1',
                        )}
                      >
                        {afterNavigationContent}
                      </div>
                    </CollapsibleGroup>
                  </div>
                )}
              </div>

              {footerSlotContent && (
                <div className="px-3 pb-1">{footerSlotContent}</div>
              )}
            </>
          )}
        </div>

        <SidebarUserProfile isCollapsed={isCollapsed} />
      </div>
    </div>
  );
}
