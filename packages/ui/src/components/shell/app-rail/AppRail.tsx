'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { applyRailAppOrder } from '@genfeedai/contracts/constants';
import type {
  AppRailNavigationItem,
  AppRailNavigationVia,
} from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useFeatureFlagContext } from '@genfeedai/hooks/feature-flags/provider';
import { useIsDesktopClient } from '@genfeedai/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import type {
  AppRailItemMenuProps,
  AppRailItemProps,
  AppRailProps,
} from '@genfeedai/props/ui/app-rail.props';
import { useNavigationIntentPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import { useHoverAnimatedIcon } from '@ui/primitives/animated-icons/use-hover-animated-icon';
import { Button } from '@ui/primitives/button';
import { Separator } from '@ui/primitives/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@ui/primitives/tooltip';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';
import { AppRailItemMenu } from './AppRailItemMenu';
import { AppRailMore } from './AppRailMore';
import { resolveAvailableRailApps } from './app-rail.availability';
import { moveRailAppBy } from './app-rail.order';
import {
  ADMIN_RAIL_APP,
  ADMIN_RAIL_BACK_APP,
  ADMIN_RAIL_CATEGORIES,
  APP_RAIL_REGISTRY,
  getActiveAppId,
  getAppRailHref,
  getAppRailShortcut,
  isAppRailItemLocked,
} from './app-rail.registry';
import { useAppRailNavigation } from './use-app-rail-navigation';
import { useRailDragReorder } from './use-rail-drag-reorder';

// Only the desktop chord is shown: the browser owns ⌘1–9 for tab switching,
// so the web "G then N" sequence stays a palette-only shortcut.
function formatRailShortcut(shortcut: string[] | undefined) {
  return shortcut?.[0] === '⌘' ? shortcut.join(' ') : undefined;
}

function AppRailItem({
  app,
  label,
  description,
  shortcut,
  badge,
  href,
  isActive,
  isLocked,
  isNavigationSuspended = false,
  onNavigateStart,
}: AppRailItemProps) {
  const t = useTranslations('common.appRail');
  const Icon = app.icon;
  const intent = useNavigationIntentPrefetch(href);
  const { hoverProps, icon: hoverIcon } = useHoverAnimatedIcon(
    <Icon aria-hidden="true" className="size-4" />,
  );
  const shortcutLabel = formatRailShortcut(shortcut);
  const hasBadge = !isLocked && badge !== undefined && badge.count > 0;
  const accessibleLabel = isNavigationSuspended
    ? `${label}. ${t('onboardingHold')}`
    : isLocked
      ? t('locked', { app: label })
      : hasBadge
        ? `${label}, ${badge.label}`
        : label;
  const itemClassName = cn(
    'relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,color] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100',
    // Codex-style selection: a filled tile two steps above the rail,
    // hover one step. The icon is the only foreground either way.
    isActive
      ? 'bg-foreground/[0.12] text-foreground'
      : 'text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground',
    isLocked && 'opacity-60',
    isNavigationSuspended && 'opacity-40',
  );
  const itemBody = (
    <>
      {hoverIcon}
      {isLocked ? (
        <span className="absolute -right-0.5 -top-0.5 inline-flex size-4 items-center justify-center rounded-full bg-gray-100 text-foreground/70 shadow-border">
          <Lock aria-hidden="true" className="size-2.5" />
        </span>
      ) : hasBadge ? (
        <span
          aria-hidden="true"
          data-testid={`app-rail-badge-${app.id}`}
          className={
            badge.kind === 'dot'
              ? 'absolute right-0.5 top-0.5 size-1.5 rounded-full bg-info'
              : 'absolute -right-1 -top-1 rounded-full bg-info px-1 text-2xs tabular-nums text-info-foreground'
          }
        >
          {badge.kind === 'dot' ? null : badge.count > 99 ? '99+' : badge.count}
        </span>
      ) : null}
      <span id={`app-rail-desc-${app.id}`} className="sr-only">
        {description}
      </span>
    </>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {isNavigationSuspended ? (
          <Button
            aria-describedby={`app-rail-desc-${app.id}`}
            ariaLabel={accessibleLabel}
            className={itemClassName}
            data-testid={`app-rail-item-${app.id}`}
            isDisabled
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            {itemBody}
          </Button>
        ) : (
          <Link
            href={href}
            prefetch={false}
            // The slot around the link is the drag source, so the browser's
            // own link drag never competes with reordering.
            draggable={false}
            aria-current={isActive ? 'page' : undefined}
            aria-describedby={`app-rail-desc-${app.id}`}
            aria-label={accessibleLabel}
            data-testid={`app-rail-item-${app.id}`}
            onBlur={(event) => {
              intent.onBlur();
              hoverProps.onBlur(event);
            }}
            onClick={onNavigateStart}
            onFocus={(event) => {
              intent.onFocus();
              hoverProps.onFocus(event);
            }}
            onMouseEnter={(event) => {
              intent.onMouseEnter();
              hoverProps.onMouseEnter(event);
            }}
            onMouseLeave={(event) => {
              intent.onMouseLeave();
              hoverProps.onMouseLeave(event);
            }}
            className={itemClassName}
          >
            {itemBody}
          </Link>
        )}
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={10}
        collisionPadding={12}
        className="max-w-60 py-2"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="font-semibold">{label}</span>
          {shortcutLabel ? (
            <kbd className="inline-flex items-center rounded-md px-1.5 py-0.5 border border-foreground/[0.08] bg-foreground/[0.03] text-xs tracking-[0.2em] text-foreground/70 font-mono">
              {shortcutLabel}
            </kbd>
          ) : null}
        </span>
        <span className="mt-0.5 block font-normal text-muted-foreground">
          {description}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

export function AppRail({
  badges,
  brandAwareSlug,
  brandSlug,
  currentPath,
  footer,
  header,
  installedAppIds,
  isAssetGateLocked = false,
  isNavigationSuspended = false,
  moduleAccess,
  modulePreferences,
  onNavigate,
  onNavigationEvent,
  onOpenAdminExternally,
  orgSlug,
  hiddenAppIds = [],
  onRailAppOrderChange,
  onReorderEvent,
  onResetRail,
  onTogglePin,
  pinnedAppIds = [],
  preservedSearch,
  railAppOrder = [],
  isAdminChrome = false,
  resolveNavigation,
  showAdmin = false,
  surface = 'desktop',
}: AppRailProps) {
  const { flags, isConfigured } = useFeatureFlagContext();
  const isDesktop = useIsDesktopClient();
  const router = useRouter();
  const t = useTranslations('common.appRail');
  const [navigationAnnouncement, setNavigationAnnouncement] = useState('');
  const navRef = useRef<HTMLElement>(null);
  const [menuTarget, setMenuTarget] =
    useState<AppRailItemMenuProps['target']>(null);
  const apps = useMemo(() => {
    if (isAdminChrome) {
      // The back button is the way out of admin; the categories are the admin nav.
      return [ADMIN_RAIL_BACK_APP, ...ADMIN_RAIL_CATEGORIES];
    }
    const visible = resolveAvailableRailApps({
      flags,
      installedAppIds,
      isConfigured,
      moduleAccess,
      modulePreferences,
    });
    return showAdmin ? [...visible, ADMIN_RAIL_APP] : visible;
  }, [
    flags,
    installedAppIds,
    isConfigured,
    isAdminChrome,
    moduleAccess,
    modulePreferences,
    showAdmin,
  ]);
  const activeAppId = getActiveAppId(
    isAdminChrome
      ? ADMIN_RAIL_CATEGORIES
      : [...APP_RAIL_REGISTRY, ADMIN_RAIL_APP],
    currentPath,
  );
  const items = useMemo<AppRailNavigationItem[]>(() => {
    let dailyIndex = 0;
    return apps.map((app) => {
      // A locked item keeps its own route: the page-level AssetGateGuard
      // renders the teaser there, which is where "Explore anyway" lives.
      const href = getAppRailHref(app, {
        orgSlug,
        brandSlug,
        brandAwareSlug,
        preservedSearch,
      });
      const navigation = resolveNavigation?.(href) ?? { href };
      const shortcutIndex = app.group === 'daily' ? dailyIndex++ : undefined;
      return {
        app,
        ...navigation,
        label: t(app.label),
        description: t(app.description),
        isLocked: isAppRailItemLocked(app, isAssetGateLocked),
        shortcut:
          shortcutIndex === undefined
            ? undefined
            : getAppRailShortcut(shortcutIndex, isDesktop),
      };
    });
  }, [
    apps,
    orgSlug,
    brandSlug,
    brandAwareSlug,
    preservedSearch,
    isAssetGateLocked,
    resolveNavigation,
    t,
    isDesktop,
  ]);
  const launcherItems = useMemo(
    () => items.filter((item) => item.app.group === 'app'),
    [items],
  );
  const adminExitItem = items.find((item) => item.app.group === 'admin-exit');
  const adminCategoryItems = items.filter(
    (item) => item.app.group === 'admin-category',
  );
  // The rail is the core loop then the pins, in the member's saved order.
  // Apps the saved order does not list (a new pin) keep their default place
  // at the end. Daily shortcuts follow the order the member sees. A core app
  // the member took off the rail waits in the More menu.
  const railItems = useMemo(() => {
    const pinnedItems = pinnedAppIds.flatMap((appId) => {
      const item = items.find(
        (candidate) =>
          candidate.app.group === 'app' && candidate.app.id === appId,
      );
      return item ? [item] : [];
    });
    let dailyIndex = 0;
    return applyRailAppOrder(
      [
        ...items.filter(
          (item) =>
            item.app.group === 'daily' && !hiddenAppIds.includes(item.app.id),
        ),
        ...pinnedItems,
      ].map((item) => ({ id: item.app.id, item })),
      railAppOrder,
    ).map(({ item }) =>
      item.app.group === 'daily'
        ? { ...item, shortcut: getAppRailShortcut(dailyIndex++, isDesktop) }
        : item,
    );
  }, [hiddenAppIds, isDesktop, items, pinnedAppIds, railAppOrder]);
  const railItemIds = useMemo(
    () => railItems.map((item) => item.app.id),
    [railItems],
  );
  // Hidden core apps first, then installed apps that are not pinned. Neither
  // holds a rail slot, so neither keeps a number shortcut.
  const moreItems = useMemo(
    () => [
      ...items
        .filter(
          (item) =>
            item.app.group === 'daily' && !railItemIds.includes(item.app.id),
        )
        .map((item) => ({ ...item, shortcut: undefined })),
      ...launcherItems.filter((item) => !railItemIds.includes(item.app.id)),
    ],
    [items, launcherItems, railItemIds],
  );
  const navigationItems = useMemo(() => {
    const byId = new Map(
      [...railItems, ...moreItems].map((item) => [item.app.id, item]),
    );
    return items.map((item) => byId.get(item.app.id) ?? item);
  }, [items, moreItems, railItems]);
  const isReorderable =
    onRailAppOrderChange !== undefined &&
    !isAdminChrome &&
    !isNavigationSuspended;
  const reorder = useCallback(
    (order: readonly string[], moved?: { id: string; position: number }) => {
      onRailAppOrderChange?.(order);
      const item = railItems.find(
        (candidate) => candidate.app.id === moved?.id,
      );
      if (moved && item) {
        onReorderEvent?.({
          app: item.app.id,
          from_index: railItemIds.indexOf(item.app.id),
          surface,
          to_index: moved.position - 1,
        });
        setNavigationAnnouncement(
          t('reordered', {
            app: item.label,
            position: moved.position,
            total: railItems.length,
          }),
        );
      }
    },
    [onRailAppOrderChange, onReorderEvent, railItemIds, railItems, surface, t],
  );
  const moveItem = useCallback(
    (item: AppRailNavigationItem, delta: -1 | 1) => {
      const from = railItemIds.indexOf(item.app.id);
      const next = moveRailAppBy(railItemIds, item.app.id, delta);
      if (next !== railItemIds) {
        reorder(next, { id: item.app.id, position: from + delta + 1 });
      }
    },
    [railItemIds, reorder],
  );
  // After the menu closes, focus the item it acted on; one that left the rail
  // (unpinned) hands focus to its neighbour, then to the More button.
  const restoreItemFocus = useCallback(
    (item: AppRailNavigationItem) => {
      const index = railItemIds.indexOf(item.app.id);
      const candidates = [
        item.app.id,
        railItemIds[index + 1],
        railItemIds[index - 1],
      ];
      requestAnimationFrame(() => {
        const nav = navRef.current;
        if (!nav) return;
        for (const id of candidates) {
          const target =
            id &&
            nav.querySelector<HTMLElement>(
              `[data-testid="app-rail-item-${id}"]`,
            );
          if (target) {
            target.focus();
            return;
          }
        }
        nav
          .querySelector<HTMLElement>('[data-testid="app-rail-more"]')
          ?.focus();
      });
    },
    [railItemIds],
  );
  const unpinItem = useCallback(
    (item: AppRailNavigationItem) => {
      onTogglePin?.(item.app.id);
      setNavigationAnnouncement(t('unpinned', { app: item.label }));
    },
    [onTogglePin, t],
  );
  const { draggingId, getItemProps, overId } = useRailDragReorder({
    ids: railItemIds,
    isEnabled: isReorderable,
    onReorder: reorder,
  });
  const handleNavigate = useCallback(
    (item: AppRailNavigationItem, via: AppRailNavigationVia) => {
      if (isNavigationSuspended) return;
      onNavigationEvent?.({
        from_app: activeAppId ?? null,
        to_app: item.app.id,
        via,
        surface,
      });
      setNavigationAnnouncement(item.announcement ?? t('opening'));
      onNavigate?.();
      if (onOpenAdminExternally && item.app.group === 'admin') {
        onOpenAdminExternally(item.href);
        return;
      }
      if (via !== 'click') router.push(item.href);
    },
    [
      activeAppId,
      isNavigationSuspended,
      onNavigationEvent,
      onOpenAdminExternally,
      surface,
      t,
      onNavigate,
      router,
    ],
  );
  const commandLabel = useCallback(
    (label: string) => t('goTo', { app: label }),
    [t],
  );
  useAppRailNavigation({
    items: navigationItems,
    surface,
    isDesktop,
    isSuspended: isNavigationSuspended,
    commandLabel,
    navigate: handleNavigate,
  });

  function renderItem(item: AppRailNavigationItem) {
    return (
      <AppRailItem
        key={item.app.id}
        {...item}
        badge={badges?.[item.app.id]}
        isActive={item.app.id === activeAppId}
        isNavigationSuspended={isNavigationSuspended}
        onNavigateStart={(event) => {
          // The link would also navigate in place; Admin opens elsewhere.
          if (onOpenAdminExternally && item.app.group === 'admin') {
            event.preventDefault();
          }
          handleNavigate(item, 'click');
        }}
      />
    );
  }
  function renderRailItem(item: AppRailNavigationItem) {
    const slotProps = getItemProps(item.app.id);
    const isDragTarget =
      draggingId !== null &&
      overId === item.app.id &&
      draggingId !== item.app.id;
    return (
      <div
        {...slotProps}
        className={cn(
          'rounded-lg',
          draggingId === item.app.id && 'opacity-40',
          isDragTarget && 'ring-2 ring-ring/60',
        )}
        data-testid={`app-rail-slot-${item.app.id}`}
        key={item.app.id}
        onContextMenu={(event) => {
          if (isNavigationSuspended || (!isReorderable && !onTogglePin)) return;
          event.preventDefault();
          // A keyboard-opened menu reports no pointer position: anchor it
          // beside the item instead.
          const hasPointer = event.clientX !== 0 || event.clientY !== 0;
          const rect = event.currentTarget.getBoundingClientRect();
          setMenuTarget({
            item,
            x: hasPointer ? event.clientX : rect.right,
            y: hasPointer ? event.clientY : rect.top,
          });
        }}
        onKeyDown={(event) => {
          if (!isReorderable || !event.altKey) return;
          const delta =
            event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
          if (delta === 0) return;
          event.preventDefault();
          moveItem(item, delta);
        }}
      >
        {renderItem(item)}
      </div>
    );
  }
  const showMore =
    !isAdminChrome && (moreItems.length > 0 || onResetRail !== undefined);
  const admin = items.find((item) => item.app.group === 'admin');
  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={200}>
      <nav
        ref={navRef}
        aria-label={t('apps')}
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto p-2 [scrollbar-width:none]! [&::-webkit-scrollbar]:hidden"
        // Page menu: the one surface exempt from the product motion policy.
        data-motion="allow"
        data-onboarding-hold={isNavigationSuspended ? 'true' : 'false'}
        data-testid="app-rail"
      >
        {header ? (
          <div
            className="flex flex-col items-center gap-1 pb-1"
            data-testid="app-rail-header"
          >
            {header}
            <Separator className="mt-1 w-5" />
          </div>
        ) : null}
        {adminExitItem ? (
          <div
            className="flex flex-col items-center gap-1"
            data-testid="app-rail-admin-exit"
          >
            {renderItem(adminExitItem)}
          </div>
        ) : null}
        {railItems.length > 0 || showMore ? (
          <div className="flex flex-col items-center gap-1">
            {railItems.map(renderRailItem)}
            {showMore ? (
              <AppRailMore
                isSuspended={isNavigationSuspended}
                items={moreItems}
                onOpen={(item) => handleNavigate(item, 'click')}
                onReset={onResetRail}
                onTogglePin={onTogglePin}
              />
            ) : null}
          </div>
        ) : null}
        {adminCategoryItems.length > 0 ? (
          <div
            className="flex flex-col items-center gap-1"
            data-testid="app-rail-admin-categories"
          >
            {adminExitItem ? <Separator className="my-1 w-5" /> : null}
            {adminCategoryItems.map(renderItem)}
          </div>
        ) : null}
        {admin || footer ? (
          <div
            className="mt-auto flex flex-col items-center gap-1 pt-2"
            data-testid="app-rail-bottom"
          >
            {admin ? renderItem(admin) : null}
            {footer ? (
              <div
                className={cn(
                  isNavigationSuspended && 'pointer-events-none opacity-40',
                )}
                inert={isNavigationSuspended || undefined}
              >
                {footer}
              </div>
            ) : null}
          </div>
        ) : null}
      </nav>
      <AppRailItemMenu
        index={menuTarget ? railItemIds.indexOf(menuTarget.item.app.id) : -1}
        isReorderable={isReorderable}
        onClose={() => setMenuTarget(null)}
        onMove={moveItem}
        onRestoreFocus={restoreItemFocus}
        onUnpin={onTogglePin ? unpinItem : undefined}
        target={menuTarget}
        total={railItems.length}
      />
      <span aria-live="polite" className="sr-only" role="status">
        {navigationAnnouncement}
      </span>
    </TooltipProvider>
  );
}

export default AppRail;
