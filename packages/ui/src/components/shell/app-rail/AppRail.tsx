'use client';

import type {
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
  APP_RAIL_REGISTRY,
  getActiveAppId,
  getAppRailShortcut,
  isAppRailItemLocked,
  resolveAppRailHref,
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
            'relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-[background-color,color] duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100',
            // Codex-style selection: a filled tile two steps above the rail,
            // hover one step. The icon is the only foreground either way.
            isActive
              ? 'bg-foreground/[0.12] text-foreground'
              : 'text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground',
            isLocked && 'opacity-60',
          )}
        >
          <Icon aria-hidden="true" className="size-[1.125rem]" />
          {isLocked ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex size-4 items-center justify-center rounded-full bg-gray-100 text-foreground/70 shadow-border">
              <Lock aria-hidden="true" className="size-2.5" />
            </span>
          ) : hasBadge ? (
            <span
              aria-hidden="true"
              data-testid={`app-rail-badge-${app.id}`}
              className="absolute -right-1 -top-1 rounded-full bg-info px-1 text-2xs tabular-nums text-info-foreground"
            >
              {badge.count > 99 ? '99+' : badge.count}
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

export function AppRail({
  badges,
  brandAwareSlug,
  brandSlug,
  currentPath,
  footer,
  header,
  isAssetGateLocked = false,
  onNavigate,
  onNavigationEvent,
  orgSlug,
  preservedSearch,
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
    const visible = APP_RAIL_REGISTRY.filter(
      (app) =>
        !app.visibilityFlagKey ||
        (Object.hasOwn(flags, app.visibilityFlagKey)
          ? flags[app.visibilityFlagKey] === true
          : !isConfigured),
    );
    return showAdmin ? [...visible, ADMIN_RAIL_APP] : visible;
  }, [flags, isConfigured, showAdmin]);
  const activeAppId = getActiveAppId(
    [...APP_RAIL_REGISTRY, ADMIN_RAIL_APP],
    currentPath,
  );
  const items = useMemo<AppRailNavigationItem[]>(
    () =>
      apps.map((app, index) => {
        const href = resolveAppRailHref(app, apps, {
          orgSlug,
          brandSlug,
          brandAwareSlug,
          preservedSearch,
          isAssetGateLocked,
        });
        const navigation = resolveNavigation?.(href) ?? { href };
        return {
          app,
          ...navigation,
          label: t(app.label),
          description: t(app.description),
          isLocked: isAppRailItemLocked(app, isAssetGateLocked),
          shortcut:
            app.group === 'admin'
              ? undefined
              : getAppRailShortcut(index, isDesktop),
        };
      }),
    [
      apps,
      orgSlug,
      brandSlug,
      brandAwareSlug,
      preservedSearch,
      isAssetGateLocked,
      resolveNavigation,
      t,
      isDesktop,
    ],
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, AppRailNavigationItem[]>();
    for (const item of items) {
      if (item.app.group === 'admin') continue;
      const group = grouped.get(item.app.group) ?? [];
      group.push(item);
      grouped.set(item.app.group, group);
    }
    return [...grouped.values()];
  }, [items]);
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
        className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 pb-2 pt-1.5"
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
        {groups.map((group, index) => (
          <div
            key={group[0]?.app.group ?? index}
            className="flex flex-col items-center gap-1"
          >
            {index > 0 ? (
              <Separator className="mb-1 w-5" data-testid="app-rail-divider" />
            ) : null}
            {group.map(renderItem)}
          </div>
        ))}
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
