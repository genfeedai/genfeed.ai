'use client';

import { UserButton, useAuth, useUser } from '@clerk/nextjs';
import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useOverviewBootstrap } from '@genfeedai/hooks/data/overview/use-overview-bootstrap';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuSharedProps } from '@genfeedai/props/navigation/menu.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Kbd } from '@genfeedai/ui';
import ProgressSidebarCard from '@ui/cards/progress-sidebar-card/ProgressSidebarCard';
import MenuItem from '@ui/menus/item/MenuItem';
import SidebarBrandRail from '@ui/menus/sidebar-brand-rail/SidebarBrandRail';
import SidebarNested from '@ui/menus/sidebar-nested/SidebarNested';
import UserDropdown from '@ui/menus/user-dropdown/UserDropdown';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  HiChevronDown,
  HiChevronRight,
  HiOutlineArrowLeft,
  HiOutlineDocumentText,
  HiPlus,
} from 'react-icons/hi2';
import { PiSidebarSimple, PiSidebarSimpleFill } from 'react-icons/pi';

/** Single-column sidebar width */
const SIDEBAR_WIDTH = 240;
const WORKSPACE_BRAND_RAIL_WIDTH = 64;

const DRILL_DOWN_GROUP_ICON_OVERRIDES = {
  Posts: HiOutlineDocumentText,
} as const;

function WorkspaceInboxMenuItem({
  href,
  isActive,
  isComingSoon,
  label,
  onClick,
  outline,
  solid,
}: {
  href?: string;
  isActive: boolean;
  isComingSoon?: boolean;
  label: string;
  onClick?: () => void;
  outline?: MenuItemConfig['outline'];
  solid?: MenuItemConfig['solid'];
}) {
  const { reviewInbox } = useOverviewBootstrap();
  const actionableCount =
    reviewInbox.pendingCount +
    reviewInbox.readyCount +
    reviewInbox.changesRequestedCount +
    reviewInbox.rejectedCount;

  return (
    <MenuItem
      badgeCount={actionableCount}
      href={href}
      isActive={isActive}
      isCollapsed={false}
      isComingSoon={isComingSoon}
      label={label}
      onClick={onClick}
      outline={outline}
      solid={solid}
      variant="icon"
    />
  );
}

export default function MenuShared({
  config,
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
  const router = useRouter();
  const { href, orgHref } = useOrgUrl();
  const [isConversationsCollapsed, setIsConversationsCollapsed] =
    useState(false);
  const { nestedGroupId, enterNestedGroup, exitNestedGroup } =
    useSidebarNavigation();
  const isWorkspaceShell = config.brandRailMode === 'workspace';

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

  /** Prefix a config-level path with the correct org scope. */
  const prefixHref = useCallback(
    (path: string) =>
      path.startsWith('/settings') ? orgHref(path) : href(path),
    [href, orgHref],
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

      if (
        href.startsWith('/elements/') &&
        Boolean(pathname?.startsWith('/elements/'))
      ) {
        return true;
      }
      if (
        href.startsWith('/ingredients/') &&
        Boolean(pathname?.startsWith('/ingredients/'))
      ) {
        return true;
      }

      return pathname === href || pathname?.startsWith(href);
    },
    [pathname],
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

  const handleLinkClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const renderGroupedItems = useCallback(
    (groups: { group: string; items: MenuItemConfig[] }[]) => (
      <>
        {groups.map((group, groupIndex) => (
          <div key={group.group || `ungrouped-${groupIndex}`}>
            {group.items[0]?.hasDividerAbove && (
              <div className="my-2 border-t border-white/[0.08]" />
            )}
            <CollapsibleGroup
              label={group.group}
              isDrillDown={group.items[0]?.drillDown === true}
            >
              {group.items[0]?.drillDown ? (
                <DrillDownGroupRow
                  group={group}
                  isActive={group.items.some(
                    (item) => item.href && isActive(item.href),
                  )}
                  defaultHref={
                    group.items[0]?.href
                      ? prefixHref(group.items[0].href)
                      : undefined
                  }
                  onEnter={() => enterNestedGroup(group.group)}
                />
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item, index) =>
                    isWorkspaceShell &&
                    item.href?.startsWith('/workspace/inbox') ? (
                      <WorkspaceInboxMenuItem
                        key={item.href || `item-${index}`}
                        href={item.href ? prefixHref(item.href) : undefined}
                        isActive={isActive(item.href ?? '')}
                        isComingSoon={item.isComingSoon}
                        label={item.label}
                        onClick={handleLinkClick}
                        outline={item.outline}
                        solid={item.solid}
                      />
                    ) : (
                      <MenuItem
                        key={item.href || `item-${index}`}
                        href={item.href ? prefixHref(item.href) : undefined}
                        label={item.label}
                        icon={item.icon}
                        outline={item.outline}
                        solid={item.solid}
                        isActive={isActive(item.href ?? '')}
                        isComingSoon={item.isComingSoon}
                        onClick={handleLinkClick}
                        variant="icon"
                        isCollapsed={false}
                      />
                    ),
                  )}
                </ul>
              )}
            </CollapsibleGroup>
          </div>
        ))}
      </>
    ),
    [enterNestedGroup, handleLinkClick, isActive, prefixHref],
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitNestedGroup();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [nestedGroupId, exitNestedGroup]);

  const secondaryNavigationContent =
    secondaryItems.length > 0 ? (
      <div
        data-testid="sidebar-secondary-items"
        className="mt-3 border-t border-white/[0.08] pt-2"
      >
        <ul className="flex flex-col gap-0.5">
          {secondaryItems.map((item, index) => (
            <MenuItem
              key={item.href || `secondary-${index}`}
              href={item.href ? prefixHref(item.href) : undefined}
              label={item.label}
              icon={item.icon}
              outline={item.outline}
              solid={item.solid}
              isActive={isActive(item.href ?? '')}
              isComingSoon={item.isComingSoon}
              onClick={handleLinkClick}
              variant="icon"
              isCollapsed={false}
            />
          ))}
        </ul>
      </div>
    ) : null;

  const navigationContent = (
    <>
      {backHref && (
        <div className="pb-1">
          <Link
            href={prefixHref(backHref)}
            className={cn(
              'flex h-9 w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-200 group',
              'text-white/80 hover:bg-white/[0.04]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
            )}
            aria-label={`Back to ${backLabel ?? 'previous page'}`}
          >
            <HiOutlineArrowLeft className="w-4 h-4 text-white/60 group-hover:text-white transition-colors duration-200" />
            <span className="text-sm font-medium text-white/90">
              {backLabel ?? 'Back'}
            </span>
          </Link>
        </div>
      )}
      {sectionLabel ? (
        <>
          {renderGroupedItems(topLevelGroups)}
          {sectionGroups.length > 0 ? (
            <CollapsibleGroup
              label={sectionLabel}
              isDrillDown={false}
              storageKey={`__${sectionLabel.toLowerCase()}__`}
            >
              {renderGroupedItems(sectionGroups)}
            </CollapsibleGroup>
          ) : null}
        </>
      ) : (
        renderGroupedItems(groupedItems)
      )}
    </>
  );

  const sharedCollapseControl = onToggleCollapse ? (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onToggleCollapse}
      className="group w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors duration-200 flex-shrink-0 cursor-pointer"
      ariaLabel={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      <span className="relative flex h-4 w-4 items-center justify-center">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={EnvironmentService.LOGO_ALT}
            className="h-4 w-4 object-contain dark:invert transition-opacity duration-200 group-hover:opacity-0"
            width={16}
            height={16}
            sizes="16px"
          />
        ) : isCollapsed ? (
          <PiSidebarSimple className="h-4 w-4 transition-opacity duration-200 group-hover:opacity-0" />
        ) : (
          <PiSidebarSimpleFill className="h-4 w-4 transition-opacity duration-200 group-hover:opacity-0" />
        )}
        <PiSidebarSimple className="absolute h-4 w-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      </span>
    </Button>
  ) : null;

  /* ── Single DOM tree: content fades out, parent clips via overflow:hidden ── */
  return (
    <div
      data-testid="sidebar-shell"
      className={cn(
        'flex h-full min-h-0 flex-1 flex-shrink-0',
        shellChromeVariant === 'default' ? 'bg-background' : 'bg-transparent',
      )}
      style={{
        minWidth:
          isWorkspaceShell && isCollapsed
            ? WORKSPACE_BRAND_RAIL_WIDTH
            : (isWorkspaceShell ? WORKSPACE_BRAND_RAIL_WIDTH : 0) +
              SIDEBAR_WIDTH,
        width:
          isWorkspaceShell && isCollapsed
            ? WORKSPACE_BRAND_RAIL_WIDTH
            : (isWorkspaceShell ? WORKSPACE_BRAND_RAIL_WIDTH : 0) +
              SIDEBAR_WIDTH,
      }}
    >
      {isWorkspaceShell ? (
        <div
          data-testid="sidebar-brand-rail"
          className={cn(
            'flex h-full w-16 flex-col border-r border-white/[0.08]',
            shellChromeVariant === 'default'
              ? 'bg-background'
              : 'bg-transparent',
          )}
        >
          <div
            className={cn(
              'flex h-16 items-center justify-center border-b border-white/[0.08]',
              shellChromeVariant === 'default'
                ? 'bg-background'
                : 'bg-transparent',
            )}
          >
            {sharedCollapseControl}
          </div>
          <SidebarBrandRail />
        </div>
      ) : null}

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          isWorkspaceShell && isCollapsed && 'pointer-events-none opacity-0',
          isWorkspaceShell && 'transition-opacity duration-200',
        )}
        style={
          isWorkspaceShell
            ? { minWidth: SIDEBAR_WIDTH, width: SIDEBAR_WIDTH }
            : undefined
        }
      >
        {!isWorkspaceShell ? (
          <div
            data-testid="sidebar-header-shell"
            className={cn(
              'flex h-16 flex-shrink-0 items-center gap-2 px-3',
              shellChromeVariant === 'default' &&
                'border-b border-white/[0.08]',
            )}
          >
            {sharedCollapseControl}
            <div className="flex-1" />
          </div>
        ) : null}

        {/* Body — fades out when collapsed, pointer-events disabled */}
        <div
          className={cn(
            'flex-1 flex flex-col min-h-0 transition-opacity duration-200',
            !isWorkspaceShell && isCollapsed
              ? 'opacity-0 pointer-events-none'
              : 'opacity-100',
          )}
        >
          {renderTopSlot ? (
            <div className="px-3 pt-3 pb-1">
              <div className="space-y-3">{renderTopSlot()}</div>
            </div>
          ) : null}

          {/* Primary actions */}
          {showPrimaryItems && config.primaryAction ? (
            <div className="px-3 pt-2 pb-1">
              {config.primaryAction.href ? (
                <Link
                  data-testid="sidebar-primary-action"
                  href={prefixHref(config.primaryAction.href)}
                  onClick={handleLinkClick}
                  className="flex h-10 w-full items-center gap-3 rounded-sm bg-white px-3 py-2 text-left text-sm font-semibold text-black transition-colors duration-200 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {config.primaryAction.icon ? (
                    config.primaryAction.icon
                  ) : config.primaryAction.solid ? (
                    <config.primaryAction.solid className="h-4 w-4" />
                  ) : config.primaryAction.outline ? (
                    <config.primaryAction.outline className="h-4 w-4" />
                  ) : (
                    <HiPlus className="h-4 w-4" />
                  )}
                  <span className="flex-1">{config.primaryAction.label}</span>
                  <Kbd
                    variant="subtle"
                    size="xs"
                    className="bg-black/[0.08] text-black/45"
                  >
                    {'\u2318\u21E7'}N
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
                  className="flex h-10 w-full items-center gap-3 rounded-sm bg-white px-3 py-2 text-left text-sm font-semibold text-black transition-colors duration-200 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {config.primaryAction.icon ? (
                    config.primaryAction.icon
                  ) : config.primaryAction.solid ? (
                    <config.primaryAction.solid className="h-4 w-4" />
                  ) : config.primaryAction.outline ? (
                    <config.primaryAction.outline className="h-4 w-4" />
                  ) : (
                    <HiPlus className="h-4 w-4" />
                  )}
                  <span className="flex-1">{config.primaryAction.label}</span>
                  <Kbd
                    variant="subtle"
                    size="xs"
                    className="bg-black/[0.08] text-black/45"
                  >
                    {'\u2318\u21E7'}N
                  </Kbd>
                </Button>
              )}
            </div>
          ) : showPrimaryItems && primaryItems.length > 0 ? (
            <div className="px-3 pt-2 pb-1">
              <ul className="flex flex-col gap-1">
                {primaryItems.map((item, index) => (
                  <MenuItem
                    key={item.href || `primary-${index}`}
                    href={item.href ? prefixHref(item.href) : undefined}
                    label={item.label}
                    icon={item.icon}
                    outline={item.outline}
                    solid={item.solid}
                    isActive={isActive(item.href ?? '')}
                    isComingSoon={item.isComingSoon}
                    onClick={handleLinkClick}
                    variant="icon"
                    isCollapsed={false}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {renderBody ? (
            <>
              {/* Custom body content */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
                {renderBody()}
              </div>

              <SidebarUserProfile />
            </>
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
                  router.push(href('/workspace/overview'));
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
                      ? 'shrink-0 px-3 py-2'
                      : 'flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-2',
                  )}
                >
                  {navigationContent}
                  {secondaryNavigationContent}
                </div>

                {renderAfterNavigation && (
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
                          className="flex h-9 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/80 transition-colors duration-200 group cursor-pointer hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                          <HiPlus className="h-4 w-4 text-white/80 group-hover:text-white" />
                          <span className="text-sm font-medium text-white/90">
                            New Chat
                          </span>
                          <Kbd
                            variant="ghost"
                            className="ml-auto text-[11px] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
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
                        {renderAfterNavigation()}
                      </div>
                    </CollapsibleGroup>
                  </div>
                )}
              </div>

              <ProgressSidebarCard />

              {renderFooterSlot && (
                <div className="px-3 pb-1">{renderFooterSlot()}</div>
              )}

              <SidebarUserProfile />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarUserProfile() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  if (!user) {
    return null;
  }

  return (
    <div className="border-t border-white/[0.08] px-3 py-3">
      <div className="flex items-center gap-2.5">
        {isSignedIn ? <UserButton /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white/90 truncate">
            {user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'User'}
          </p>
        </div>
        <UserDropdown
          userName={user.fullName ?? 'User'}
          userEmail={user.primaryEmailAddress?.emailAddress ?? ''}
        />
      </div>
    </div>
  );
}

const COLLAPSED_GROUPS_KEY = 'genfeed:sidebar:collapsed';

function getCollapsedGroups(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }
  try {
    const stored = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function persistCollapsedGroups(groups: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...groups]));
  } catch {
    // Silently ignore localStorage errors
  }
}

/** Collapsible group with label header and toggle */
function CollapsibleGroup({
  label,
  isDrillDown,
  children,
  storageKey,
  actions,
  className,
  contentClassName,
  headerClassName,
  onCollapsedChange,
}: {
  label: string;
  isDrillDown: boolean;
  children: React.ReactNode;
  storageKey?: string;
  actions?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
  onCollapsedChange?: (isCollapsed: boolean) => void;
}) {
  const key = storageKey ?? label;
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const collapsed = getCollapsedGroups().has(key);
    if (collapsed) {
      setIsCollapsed(true);
    }
  }, [key]);

  useEffect(() => {
    onCollapsedChange?.(isCollapsed);
  }, [isCollapsed, onCollapsedChange]);

  const handleToggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      const groups = getCollapsedGroups();
      if (next) {
        groups.add(key);
      } else {
        groups.delete(key);
      }
      persistCollapsedGroups(groups);
      return next;
    });
  }, [key]);

  // DrillDown groups render their own row — no separate label needed
  if (isDrillDown) {
    return <div className={cn('mt-1', className)}>{children}</div>;
  }

  // Ungrouped items (empty label) render flat without a collapsible header
  if (!label) {
    return <div className={cn('mt-1', className)}>{children}</div>;
  }

  return (
    <div className={cn('mt-2', className)}>
      <div
        className={cn(
          'group/collapsible flex w-full items-center px-1 py-1 text-white/30',
          headerClassName,
        )}
      >
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={handleToggle}
          className="flex items-center gap-1.5 hover:text-white/50 transition-colors duration-150 cursor-pointer"
        >
          <HiChevronDown
            className={cn(
              'w-3 h-3 transition-transform duration-200',
              isCollapsed && '-rotate-90',
            )}
          />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em]">
            {label}
          </span>
        </Button>
        {actions && !isCollapsed && <div className="ml-auto">{actions}</div>}
      </div>
      {!isCollapsed && <div className={contentClassName}>{children}</div>}
    </div>
  );
}

/** A single row representing a drill-down group with > chevron */
function DrillDownGroupRow({
  group,
  isActive,
  defaultHref,
  onEnter,
}: {
  group: { group: string; items: MenuItemConfig[] };
  isActive: boolean;
  defaultHref?: string;
  onEnter: () => void;
}) {
  const router = useRouter();
  const firstItem = group.items[0];
  const OutlineIcon =
    DRILL_DOWN_GROUP_ICON_OVERRIDES[
      group.group as keyof typeof DRILL_DOWN_GROUP_ICON_OVERRIDES
    ] ?? firstItem?.outline;

  const handleClick = () => {
    onEnter();
    if (defaultHref) {
      router.push(defaultHref);
    }
  };

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Keep native link behavior for modified/middle clicks.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    onEnter();
  };

  const rowClasses = cn(
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-200 group',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    isActive
      ? 'bg-white/[0.08] text-white'
      : 'text-white/80 hover:bg-white/[0.04]',
  );

  const content = (
    <>
      {OutlineIcon && (
        <OutlineIcon
          className={cn(
            'w-4 h-4 transition-colors duration-200',
            isActive ? 'text-primary' : 'text-white/80 group-hover:text-white',
          )}
        />
      )}
      <span
        className={cn(
          'text-sm font-medium flex-1 text-left',
          isActive ? 'text-white font-semibold' : 'text-white/90',
        )}
      >
        {group.group}
      </span>
      <HiChevronRight className="w-4 h-4 text-white/30" />
    </>
  );

  if (defaultHref) {
    return (
      <Link href={defaultHref} onClick={handleLinkClick} className={rowClasses}>
        {content}
      </Link>
    );
  }

  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={handleClick}
      className={cn(rowClasses, 'cursor-pointer')}
    >
      {content}
    </Button>
  );
}
