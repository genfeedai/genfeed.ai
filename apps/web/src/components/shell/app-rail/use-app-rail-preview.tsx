'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Kbd } from '@ui/primitives/kbd';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import {
  type FocusEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  AppRailPreviewApp,
  UseAppRailPreviewOptions,
  UseAppRailPreviewResult,
} from '@/props/ui/app-rail.props';
import { APP_RAIL_PREVIEWS } from './app-rail.previews';

/** Hover intent: a pointer passing over the rail does not open anything. */
const OPEN_DELAY_MS = 250;
/** Room to cross the gap between the rail and the preview. */
const CLOSE_DELAY_MS = 140;
const GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 12;
const APP_ATTRIBUTE = 'data-app-rail-app';

interface PreviewPosition {
  id: string;
  left: number;
  top: number;
}

function findRailApp(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>(`[${APP_ATTRIBUTE}]`)
    : null;
}

interface AppRailPreviewFlyoutProps {
  app: AppRailPreviewApp;
  left: number;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onSelect: () => void;
  top: number;
}

function AppRailPreviewFlyout({
  app,
  left,
  onPointerEnter,
  onPointerLeave,
  onSelect,
  top,
}: AppRailPreviewFlyoutProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [clampedTop, setClampedTop] = useState(top);
  const Body = APP_RAIL_PREVIEWS[app.id];

  // Keep the whole preview on screen: slide up when it would run past the
  // bottom edge. The body grows as its data arrives, so the height is read
  // again whenever the box resizes.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const place = () =>
      setClampedTop(
        Math.max(
          VIEWPORT_MARGIN_PX,
          Math.min(
            top,
            window.innerHeight - element.offsetHeight - VIEWPORT_MARGIN_PX,
          ),
        ),
      );
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => observer.disconnect();
  }, [top]);

  return createPortal(
    <div
      aria-label={app.label}
      className={cn(
        'app-region-no-drag fixed z-50 w-80 overflow-hidden rounded-xl bg-muted text-foreground shadow-dropdown',
        // Moving to the next icon slides the preview there instead of
        // closing and reopening it.
        'transition-[top] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
        'animate-in fade-in-0 slide-in-from-left-1 duration-150 motion-reduce:animate-none',
      )}
      // Page menu: exempt from the product motion policy, like the rail.
      data-motion="allow"
      data-testid="app-rail-preview"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      ref={ref}
      role="group"
      style={{ left, top: clampedTop }}
    >
      <div className="flex max-h-[30rem] flex-col">
        <Link
          className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`app-rail-preview-open-${app.id}`}
          href={app.href}
          onClick={onSelect}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {app.label}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {app.description}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
            {app.shortcut ? <Kbd>{app.shortcut}</Kbd> : null}
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </span>
        </Link>
        <div className="min-h-0 overflow-y-auto p-1.5" key={app.id}>
          {Body ? <Body href={app.href} /> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Hover preview for the app rail: a minified view of an app's content beside
 * its icon, before the member opens it. One controller serves every item
 * (delegated from the `nav`), so moving from one icon to the next swaps the
 * preview in place. The active app has none: its page is already on screen.
 */
export function useAppRailPreview({
  activeAppId,
  apps,
  isEnabled,
  navRef,
}: UseAppRailPreviewOptions): UseAppRailPreviewResult {
  const [position, setPosition] = useState<PreviewPosition | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const isOpenRef = useRef(false);
  const appsById = useMemo(
    () => new Map(apps.map((app) => [app.id, app])),
    [apps],
  );
  isOpenRef.current = position !== null;

  const cancelTimers = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, []);
  const close = useCallback(() => {
    cancelTimers();
    setPosition(null);
  }, [cancelTimers]);
  const scheduleClose = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(
      () => setPosition(null),
      CLOSE_DELAY_MS,
    );
  }, []);
  const show = useCallback(
    (id: string, anchor: HTMLElement) => {
      const rail = navRef.current?.getBoundingClientRect();
      const item = anchor.getBoundingClientRect();
      setPosition({
        id,
        left: (rail?.right ?? item.right) + GAP_PX,
        top: item.top,
      });
    },
    [navRef],
  );
  const isPreviewable = useCallback(
    (id: string) => isEnabled && id !== activeAppId && appsById.has(id),
    [activeAppId, appsById, isEnabled],
  );

  const onPointerOver = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      // Touch has no hover; a tap navigates.
      if (event.pointerType === 'touch') return;
      const anchor = findRailApp(event.target);
      if (!anchor) return;
      const id = anchor.getAttribute(APP_ATTRIBUTE) ?? '';
      window.clearTimeout(closeTimer.current);
      window.clearTimeout(openTimer.current);
      if (!isPreviewable(id)) {
        if (isOpenRef.current) scheduleClose();
        return;
      }
      if (isOpenRef.current) {
        show(id, anchor);
        return;
      }
      openTimer.current = window.setTimeout(
        () => show(id, anchor),
        OPEN_DELAY_MS,
      );
    },
    [isPreviewable, scheduleClose, show],
  );
  const onFocusCapture = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const anchor = findRailApp(event.target);
      if (!anchor || !event.target.matches(':focus-visible')) return;
      const id = anchor.getAttribute(APP_ATTRIBUTE) ?? '';
      if (isPreviewable(id)) show(id, anchor);
    },
    [isPreviewable, show],
  );
  const onBlurCapture = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (findRailApp(event.target)) scheduleClose();
    },
    [scheduleClose],
  );

  // A preview for an app that became active, or a rail that stopped allowing
  // previews (a drag started), must not stay on screen.
  useEffect(() => {
    if (position && !isPreviewable(position.id)) close();
  }, [close, isPreviewable, position]);
  useEffect(() => {
    if (!position) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [close, position]);
  useEffect(() => cancelTimers, [cancelTimers]);

  const app = position ? appsById.get(position.id) : undefined;

  return {
    close,
    flyout:
      app && position ? (
        <AppRailPreviewFlyout
          app={app}
          left={position.left}
          onPointerEnter={() => window.clearTimeout(closeTimer.current)}
          onPointerLeave={scheduleClose}
          onSelect={close}
          top={position.top}
        />
      ) : null,
    navProps: {
      onBlurCapture,
      onFocusCapture,
      onPointerLeave: scheduleClose,
      onPointerOver,
    },
  };
}
