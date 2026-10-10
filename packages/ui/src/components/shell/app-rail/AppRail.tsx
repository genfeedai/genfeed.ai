'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  isNativeAppLaunchable,
  isNativeSecondaryAppId,
  NATIVE_SECONDARY_APP_IDS,
  ORGANIZATION_MODULES,
  resolveNativeAppAvailability,
} from '@genfeedai/contracts/constants';
import type {
  AppRailItemConfig,
  AppRailNavigationItem,
  AppRailNavigationVia,
} from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useFeatureFlagContext } from '@genfeedai/hooks/feature-flags/provider';
import { useIsDesktopClient } from '@genfeedai/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import type {
  AppRailItemProps,
  AppRailLauncherProps,
  AppRailLauncherRowProps,
  AppRailProps,
} from '@genfeedai/props/ui/app-rail.props';
import { useNavigationIntentPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Separator } from '@ui/primitives/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@ui/primitives/tooltip';
import { LayoutGrid, Lock, Pin, Store } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  ADMIN_RAIL_APP,
  APP_RAIL_REGISTRY,
  getActiveAppId,
  getAppRailHref,
  getAppRailShortcut,
  isAppRailItemEnabled,
  isAppRailItemLocked,
} from './app-rail.registry';
import { useAppRailNavigation } from './use-app-rail-navigation';

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
  onNavigateStart,
}: AppRailItemProps) {
  const t = useTranslations('common.appRail');
  const Icon = app.icon;
  const intent = useNavigationIntentPrefetch(href);
  const shortcutLabel = formatRailShortcut(shortcut);
  const hasBadge = !isLocked && badge !== undefined && badge.count > 0;
  const accessibleLabel = isLocked
    ? t('locked', { app: label })
    : hasBadge
      ? `${label}, ${badge.label}`
      : label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          prefetch={false}
          aria-current={isActive ? 'page' : undefined}
          aria-describedby={`app-rail-desc-${app.id}`}
          aria-label={accessibleLabel}
          data-testid={`app-rail-item-${app.id}`}
          onBlur={intent.onBlur}
          onClick={onNavigateStart}
          onFocus={intent.onFocus}
          onMouseEnter={intent.onMouseEnter}
          onMouseLeave={intent.onMouseLeave}
          className={cn(
            'relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,color] duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100',
            // Codex-style selection: a filled tile two steps above the rail,
            // hover one step. The icon is the only foreground either way.
            isActive
              ? 'bg-foreground/[0.12] text-foreground'
              : 'text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground',
            isLocked && 'opacity-60',
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
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
              {badge.kind === 'dot'
                ? null
                : badge.count > 99
                  ? '99+'
                  : badge.count}
            </span>
          ) : null}
          <span id={`app-rail-desc-${app.id}`} className="sr-only">
            {description}
          </span>
        </Link>
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

function AppRailLauncherRow({
  badge,
  isActive,
  isPinned,
  item,
  onNavigateStart,
  onTogglePin,
}: AppRailLauncherRowProps) {
  const t = useTranslations('common.appRail');
  const Icon = item.app.icon;
  const intent = useNavigationIntentPrefetch(item.href);
  const hasBadge = !item.isLocked && badge !== undefined && badge.count > 0;
  const accessibleLabel = item.isLocked
    ? t('locked', { app: item.label })
    : hasBadge
      ? `${item.label}, ${badge.label}`
      : item.label;

  return (
    <div className="group/app-rail-row flex items-center gap-0.5">
      <Link
        href={item.href}
        prefetch={false}
        aria-current={isActive ? 'page' : undefined}
        aria-label={accessibleLabel}
        data-testid={`app-rail-launcher-item-${item.app.id}`}
        onBlur={intent.onBlur}
        onClick={onNavigateStart}
        onFocus={intent.onFocus}
        onMouseEnter={intent.onMouseEnter}
        onMouseLeave={intent.onMouseLeave}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          isActive
            ? 'bg-foreground/[0.12] text-foreground'
            : 'hover:bg-foreground/[0.06] hover:text-foreground',
          item.isLocked && 'opacity-60',
        )}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
        {item.isLocked ? (
          <Lock
            aria-hidden="true"
            className="ml-auto size-3 text-foreground/70"
          />
        ) : hasBadge ? (
          <span
            aria-hidden="true"
            data-testid={`app-rail-badge-${item.app.id}`}
            className={
              badge.kind === 'dot'
                ? 'ml-auto size-1.5 rounded-full bg-info'
                : 'ml-auto rounded-full bg-info px-1 text-2xs tabular-nums text-info-foreground'
            }
          >
            {badge.kind === 'dot'
              ? null
              : badge.count > 99
                ? '99+'
                : badge.count}
          </span>
        ) : null}
      </Link>
      {onTogglePin ? (
        <Button
          ariaLabel={t(isPinned ? 'unpin' : 'pin', { app: item.label })}
          className={cn(
            'size-8 shrink-0 text-foreground/50 transition-opacity duration-150 hover:text-foreground motion-reduce:transition-none',
            '[@media(hover:none)]:size-11',
            '[@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0',
            '[@media(hover:hover)]:group-hover/app-rail-row:pointer-events-auto [@media(hover:hover)]:group-hover/app-rail-row:opacity-100',
            '[@media(hover:hover)]:group-focus-within/app-rail-row:pointer-events-auto [@media(hover:hover)]:group-focus-within/app-rail-row:opacity-100',
          )}
          onClick={() => onTogglePin(item.app.id)}
          size={ButtonSize.ICON}
          textTransform="none"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <Pin
            aria-hidden="true"
            className={cn('size-3.5', isPinned && 'fill-current')}
          />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The Apps launcher (#5502): the member's installed, permitted apps, searchable
 * by name, with a way into the Store to find more. It replaces the old More
 * overflow; apps open directly with no Studio parent in between.
 */
function AppRailLauncher({
  activeAppId,
  badges,
  items,
  onNavigateStart,
  onTogglePin,
  pinnedAppIds,
  storeHref,
}: AppRailLauncherProps) {
  const t = useTranslations('common.appRail');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingItems = normalizedQuery
    ? items.filter((item) =>
        item.label.toLocaleLowerCase().includes(normalizedQuery),
      )
    : items;
  const isActive = items.some(
    (item) =>
      item.app.id === activeAppId && !pinnedAppIds.includes(item.app.id),
  );
  const unpinnedBadgeCount = items.reduce((sum, item) => {
    if (pinnedAppIds.includes(item.app.id)) return sum;
    const badge = badges?.[item.app.id];
    return sum + (!item.isLocked && badge && badge.count > 0 ? badge.count : 0);
  }, 0);

  return (
    <Popover onOpenChange={(isOpen) => !isOpen && setQuery('')}>
      <PopoverTrigger
        aria-label={t('launcher')}
        data-active={isActive}
        data-testid="app-rail-launcher"
        className={cn(
          'relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,color] duration-150',
          isActive
            ? 'bg-foreground/[0.12] text-foreground'
            : 'text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground data-[state=open]:bg-foreground/[0.06] data-[state=open]:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100',
        )}
      >
        <LayoutGrid aria-hidden="true" className="size-4" />
        {unpinnedBadgeCount > 0 ? (
          <span
            aria-hidden="true"
            data-testid="app-rail-launcher-badge"
            className="absolute -right-1 -top-1 rounded-full bg-info px-1 text-2xs tabular-nums text-info-foreground"
          >
            {unpinnedBadgeCount > 99 ? '99+' : unpinnedBadgeCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverPanelContent
        align="end"
        className="flex w-60 flex-col gap-1 p-1"
        data-testid="app-rail-launcher-menu"
        side="right"
        sideOffset={10}
      >
        {items.length > 0 ? (
          <Input
            aria-label={t('search')}
            data-testid="app-rail-launcher-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
            type="search"
            value={query}
          />
        ) : null}
        <div className="flex flex-col" role="group" aria-label={t('launcher')}>
          {matchingItems.map((item) => (
            <AppRailLauncherRow
              key={item.app.id}
              badge={badges?.[item.app.id]}
              isActive={
                item.app.id === activeAppId &&
                !pinnedAppIds.includes(item.app.id)
              }
              isPinned={pinnedAppIds.includes(item.app.id)}
              item={item}
              onNavigateStart={() => onNavigateStart(item)}
              onTogglePin={onTogglePin}
            />
          ))}
          {matchingItems.length === 0 ? (
            <p
              className="px-2 py-1.5 text-[13px] text-muted-foreground"
              data-testid="app-rail-launcher-empty"
            >
              {items.length === 0 ? t('noApps') : t('noMatches')}
            </p>
          ) : null}
        </div>
        {storeHref ? (
          <Link
            href={storeHref}
            prefetch={false}
            data-testid="app-rail-store"
            onClick={() => onNavigateStart()}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors',
              'hover:bg-foreground/[0.06] hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            )}
          >
            <Store aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{t('store')}</span>
          </Link>
        ) : null}
      </PopoverPanelContent>
    </Popover>
  );
}

/**
 * A launcher app shows only while its platform switches are on and the member
 * has it installed with organization, subscription and release access. An
 * absent `installedAppIds` or `moduleAccess` is a neutral surface with no
 * member or organization to consult.
 */
function isLauncherAppAvailable(
  app: AppRailItemConfig,
  {
    installedAppIds,
    isFounderOperator,
    moduleAccess,
  }: Pick<
    AppRailProps,
    'installedAppIds' | 'isFounderOperator' | 'moduleAccess'
  >,
): boolean {
  if (!isNativeSecondaryAppId(app.id)) return false;
  return isNativeAppLaunchable(
    resolveNativeAppAvailability({
      appId: app.id,
      installedAppIds: installedAppIds ?? NATIVE_SECONDARY_APP_IDS,
      isFounderOperator: isFounderOperator === true,
      organizationAccess:
        moduleAccess === undefined || !app.organizationModule
          ? { isAllowed: true, reason: null }
          : (moduleAccess?.[app.organizationModule] ?? null),
      pinnedAppIds: [],
    }),
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
  isFounderOperator,
  moduleAccess,
  modulePreferences,
  onNavigate,
  onNavigationEvent,
  onTogglePin,
  orgSlug,
  pinnedAppIds = [],
  preservedSearch,
  resolveNavigation,
  showAdmin = false,
  storeHref,
  surface = 'desktop',
}: AppRailProps) {
  const { flags, isConfigured } = useFeatureFlagContext();
  const isDesktop = useIsDesktopClient();
  const router = useRouter();
  const t = useTranslations('common.appRail');
  const [navigationAnnouncement, setNavigationAnnouncement] = useState('');
  const apps = useMemo(() => {
    const visible = APP_RAIL_REGISTRY.filter((app) => {
      if (!isAppRailItemEnabled(app, flags, isConfigured)) {
        return false;
      }
      if (app.group === 'app') {
        return isLauncherAppAvailable(app, {
          installedAppIds,
          isFounderOperator,
          moduleAccess,
        });
      }
      return (
        !app.organizationModule ||
        modulePreferences === undefined ||
        modulePreferences?.[app.organizationModule] === true ||
        !ORGANIZATION_MODULES[app.organizationModule].isToggleable
      );
    });
    return showAdmin ? [...visible, ADMIN_RAIL_APP] : visible;
  }, [
    flags,
    installedAppIds,
    isConfigured,
    isFounderOperator,
    moduleAccess,
    modulePreferences,
    showAdmin,
  ]);
  const activeAppId = getActiveAppId(
    [...APP_RAIL_REGISTRY, ADMIN_RAIL_APP],
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
  const dailyItems = items.filter((item) => item.app.group === 'daily');
  const launcherItems = items.filter((item) => item.app.group === 'app');
  const pinnedItems = pinnedAppIds.flatMap((appId) => {
    const item = launcherItems.find((candidate) => candidate.app.id === appId);
    return item ? [item] : [];
  });
  const handleNavigate = useCallback(
    (item: AppRailNavigationItem, via: AppRailNavigationVia) => {
      onNavigationEvent?.({
        from_app: activeAppId ?? null,
        to_app: item.app.id,
        via,
        surface,
      });
      setNavigationAnnouncement(item.announcement ?? t('opening'));
      onNavigate?.();
      if (via !== 'click') router.push(item.href);
    },
    [activeAppId, onNavigationEvent, surface, t, onNavigate, router],
  );
  const commandLabel = useCallback(
    (label: string) => t('goTo', { app: label }),
    [t],
  );
  useAppRailNavigation({
    items,
    surface,
    isDesktop,
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
        onNavigateStart={() => handleNavigate(item, 'click')}
      />
    );
  }
  const admin = items.find((item) => item.app.group === 'admin');
  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={200}>
      <nav
        aria-label={t('apps')}
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto p-2 [scrollbar-width:none]! [&::-webkit-scrollbar]:hidden"
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
        <div className="flex flex-col items-center gap-1">
          {dailyItems.map(renderItem)}
          <AppRailLauncher
            activeAppId={activeAppId}
            badges={badges}
            items={launcherItems}
            onNavigateStart={(item) =>
              item ? handleNavigate(item, 'click') : onNavigate?.()
            }
            onTogglePin={onTogglePin}
            pinnedAppIds={pinnedAppIds}
            storeHref={storeHref}
          />
          {pinnedItems.length > 0 ? (
            <Separator
              className="my-1 w-5"
              data-testid="app-rail-pins-separator"
            />
          ) : null}
          {pinnedItems.map(renderItem)}
        </div>
        {admin || footer ? (
          <div
            className="mt-auto flex flex-col items-center gap-1 pt-2"
            data-testid="app-rail-bottom"
          >
            {admin ? renderItem(admin) : null}
            {footer}
          </div>
        ) : null}
      </nav>
      <span aria-live="polite" className="sr-only" role="status">
        {navigationAnnouncement}
      </span>
    </TooltipProvider>
  );
}

export default AppRail;
