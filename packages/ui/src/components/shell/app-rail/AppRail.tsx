'use client';

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
  AppRailProps,
} from '@genfeedai/props/ui/app-rail.props';
import { useNavigationIntentPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import { useHoverAnimatedIcon } from '@ui/primitives/animated-icons/use-hover-animated-icon';
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
import { useCallback, useMemo, useState } from 'react';
import {
  ADMIN_RAIL_APP,
  ADMIN_RAIL_CATEGORIES,
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
  const { hoverProps, icon: hoverIcon } = useHoverAnimatedIcon(
    <Icon aria-hidden="true" className="size-4" />,
  );
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
  orgSlug,
  pinnedAppIds = [],
  preservedSearch,
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
  const apps = useMemo(() => {
    if (isAdminChrome) {
      // Workspace is the way out of admin; the categories are the admin nav.
      const exit = APP_RAIL_REGISTRY.filter((app) => app.id === 'workspace');
      return [...exit, ...ADMIN_RAIL_CATEGORIES];
    }
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
    isAdminChrome,
    isFounderOperator,
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
  const dailyItems = items.filter((item) => item.app.group === 'daily');
  const launcherItems = items.filter((item) => item.app.group === 'app');
  const adminCategoryItems = items.filter(
    (item) => item.app.group === 'admin-category',
  );
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
          {pinnedItems.length > 0 ? (
            <Separator
              className="my-1 w-5"
              data-testid="app-rail-pins-separator"
            />
          ) : null}
          {pinnedItems.map(renderItem)}
        </div>
        {adminCategoryItems.length > 0 ? (
          <div
            className="flex flex-col items-center gap-1"
            data-testid="app-rail-admin-categories"
          >
            <Separator className="my-1 w-5" />
            {adminCategoryItems.map(renderItem)}
          </div>
        ) : null}
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
