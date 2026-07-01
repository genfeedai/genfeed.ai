'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { MenuSharedProps } from '@genfeedai/props/navigation/menu.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import MenuItem from '@ui/menus/item/MenuItem';
import SidebarNested from '@ui/menus/sidebar-nested/SidebarNested';
import { useNavigationPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HiOutlineArrowLeft } from 'react-icons/hi2';
import CollapsibleGroup from './CollapsibleGroup';
import MenuSharedConversations from './MenuSharedConversations';
import MenuSharedGroupedItems from './MenuSharedGroupedItems';
import MenuSharedPrimaryAction from './MenuSharedPrimaryAction';
import SidebarUserProfile from './SidebarUserProfile';
import { useMenuShared } from './useMenuShared';

/** Single-column sidebar width */
const SIDEBAR_WIDTH = 240;

export default function MenuShared({
  config,
  onClose,
  renderTopSlot,
  renderBody,
  renderAfterNavigation,
  backHref,
  backLabel,
  currentApp,
  sectionLabel,
  isCollapsed,
  shellChromeVariant = 'default',
  onToggleCollapse,
  showPrimaryItems = true,
  conversationActions,
  renderFooterSlot,
  showUserProfile = true,
  orgSwitcherSlot,
}: MenuSharedProps) {
  const { push } = useRouter();

  const {
    logoUrl,
    href,
    orgHref,
    isConversationsCollapsed,
    setIsConversationsCollapsed,
    nestedGroupId,
    enterNestedGroup,
    exitNestedGroup,
    prefixHref,
    isActiveItem,
    primaryItems,
    secondaryItems,
    groupedItems,
    handleLinkClick,
    nestedGroup,
    topSlotContent,
    bodyContent,
    afterNavigationContent,
    footerSlotContent,
  } = useMenuShared({
    config,
    onClose,
    renderTopSlot,
    renderBody,
    renderAfterNavigation,
    renderFooterSlot,
  });
  const resolvedBackHref = backHref
    ? (prefixHref({ href: backHref }) ?? backHref)
    : undefined;
  const prefetchBackHref = useNavigationPrefetch(resolvedBackHref);
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

  const sharedGroupProps = {
    prefixHref,
    isActiveItem,
    handleLinkClick,
    enterNestedGroup,
  };

  const navigationContent = (
    <>
      {backHref && (
        <div className="pb-1">
          <Link
            href={resolvedBackHref ?? backHref}
            onFocus={prefetchBackHref}
            onMouseEnter={prefetchBackHref}
            className={cn(
              'group flex h-7 w-full items-center gap-2 rounded px-2.5 py-1 transition-colors duration-150',
              'text-foreground/72 hover:bg-foreground/[0.035] hover:text-foreground',
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
        <CollapsibleGroup
          label={sectionLabel}
          isDrillDown={false}
          storageKey={`__${sectionLabel.toLowerCase()}__`}
        >
          <MenuSharedGroupedItems groups={groupedItems} {...sharedGroupProps} />
        </CollapsibleGroup>
      ) : (
        <MenuSharedGroupedItems groups={groupedItems} {...sharedGroupProps} />
      )}
    </>
  );

  const sharedCollapseControl = onToggleCollapse ? (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onToggleCollapse}
      className="flex size-7 flex-shrink-0 items-center justify-center rounded-md bg-transparent text-foreground/72 cursor-pointer transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
      data-shell-current-app={currentApp ?? 'workspace'}
      data-shell-section-label={sectionLabel ?? ''}
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
            'flex h-12 flex-shrink-0 items-center gap-1.5 px-3',
            shellChromeVariant === 'default' && 'border-b border-border',
          )}
        >
          {sharedCollapseControl}
        </div>

        {/* Body — fades out when collapsed, pointer-events disabled */}
        <div
          className={cn(
            'flex-1 flex flex-col min-h-0 transition-opacity duration-200',
            isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100',
          )}
        >
          {orgSwitcherSlot ? (
            <div className="px-3 pt-2">{orgSwitcherSlot}</div>
          ) : null}

          {topSlotContent ? (
            <div className="px-3 pt-2">{topSlotContent}</div>
          ) : null}

          {/* Primary actions */}
          {showPrimaryItems ? (
            <MenuSharedPrimaryAction
              config={config}
              primaryItems={primaryItems}
              prefixHref={prefixHref}
              isActiveItem={isActiveItem}
              handleLinkClick={handleLinkClick}
            />
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
                  <MenuSharedConversations
                    afterNavigationContent={afterNavigationContent}
                    conversationActions={conversationActions}
                    isConversationsCollapsed={isConversationsCollapsed}
                    newAgentThreadHref={orgHref(APP_ROUTES.AGENT.NEW)}
                    onCollapsedChange={setIsConversationsCollapsed}
                  />
                )}
              </div>

              {footerSlotContent && (
                <div className="px-3 pb-1">{footerSlotContent}</div>
              )}
            </>
          )}
        </div>

        {showUserProfile ? (
          <SidebarUserProfile isCollapsed={isCollapsed} />
        ) : null}
      </div>
    </div>
  );
}
