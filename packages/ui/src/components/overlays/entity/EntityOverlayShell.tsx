'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  closeModal,
  isModalOpen,
  openModal,
  subscribeModal,
} from '@helpers/ui/modal/modal.helper';
import {
  AGENT_PANEL_DESKTOP_MEDIA_QUERY,
  AGENT_PANEL_STATE_CHANGED_EVENT,
  type AgentPanelStateChangedDetail,
  dispatchEntityOverlayClosed,
  dispatchEntityOverlayOpenAgentRequested,
  dispatchEntityOverlayOpened,
  getStoredAgentPanelOpenState,
  isDesktopAgentViewport,
} from '@services/core/agent-overlay-coordination.service';
import { Button } from '@ui/primitives/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import {
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { HiArrowTopRightOnSquare } from 'react-icons/hi2';

type EntityOverlayWidth = 'lg' | 'xl' | '2xl' | 'full';
type EntityOverlaySurface = 'gradient' | 'flat';

export interface EntityOverlayShellProps extends PropsWithChildren {
  id: string;
  title?: string;
  description?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  onOpenDetail?: () => void;
  openDetailLabel?: string;
  footer?: ReactNode;
  onClose?: () => void;
  width?: EntityOverlayWidth;
  surface?: EntityOverlaySurface;
  className?: string;
  bodyClassName?: string;
}

const WIDTH_CLASS_NAMES: Record<EntityOverlayWidth, string> = {
  '2xl': 'w-full sm:max-w-[min(96rem,96vw)]',
  full: 'w-full sm:max-w-[100vw]',
  lg: 'w-full sm:max-w-[min(48rem,92vw)]',
  xl: 'w-full sm:max-w-[min(72rem,94vw)]',
};

const SURFACE_CLASS_NAMES: Record<EntityOverlaySurface, string> = {
  flat: 'bg-background/95 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-background/88',
  gradient:
    'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_30%),linear-gradient(180deg,rgba(15,15,18,0.98),rgba(7,7,9,0.98))] shadow-[0_30px_120px_rgba(0,0,0,0.55)]',
};

export default function EntityOverlayShell({
  id,
  title,
  description,
  badges,
  actions,
  onOpenDetail,
  openDetailLabel = 'Open page',
  footer,
  onClose,
  width = 'xl',
  surface = 'gradient',
  className,
  bodyClassName,
  children,
}: EntityOverlayShellProps) {
  const subscribe = useCallback(
    (listener: () => void) => subscribeModal(id, listener),
    [id],
  );
  const getSnapshot = useCallback(() => isModalOpen(id), [id]);
  const isOpen = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const previousOpenRef = useRef(isOpen);
  const overlaySessionOpenRef = useRef(false);
  const [canOpenAgent, setCanOpenAgent] = useState<boolean>(() => {
    const storedAgentState = getStoredAgentPanelOpenState();

    return isDesktopAgentViewport() && storedAgentState !== true;
  });

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openModal(id);
        return;
      }

      closeModal(id);
    },
    [id],
  );

  useEffect(() => {
    const wasOpen = previousOpenRef.current;
    if (wasOpen && !isOpen) {
      onCloseRef.current?.();
    }
    previousOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !overlaySessionOpenRef.current) {
      overlaySessionOpenRef.current = true;
      dispatchEntityOverlayOpened(id);
    }

    if (!isOpen && overlaySessionOpenRef.current) {
      overlaySessionOpenRef.current = false;
      dispatchEntityOverlayClosed(id);
    }
  }, [id, isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(AGENT_PANEL_DESKTOP_MEDIA_QUERY);
    const syncAgentActionAvailability = (): void => {
      const storedAgentState = getStoredAgentPanelOpenState();

      setCanOpenAgent(mediaQuery.matches && storedAgentState !== true);
    };
    const handleAgentStateChanged = (event: Event): void => {
      setCanOpenAgent(
        mediaQuery.matches &&
          !(event as CustomEvent<AgentPanelStateChangedDetail>).detail.isOpen,
      );
    };

    syncAgentActionAvailability();
    mediaQuery.addEventListener('change', syncAgentActionAvailability);
    window.addEventListener(
      AGENT_PANEL_STATE_CHANGED_EVENT,
      handleAgentStateChanged,
    );

    return () => {
      mediaQuery.removeEventListener('change', syncAgentActionAvailability);
      window.removeEventListener(
        AGENT_PANEL_STATE_CHANGED_EVENT,
        handleAgentStateChanged,
      );
    };
  }, []);

  useEffect(() => {
    return () => {
      if (overlaySessionOpenRef.current) {
        dispatchEntityOverlayClosed(id);
        overlaySessionOpenRef.current = false;
      }
    };
  }, [id]);

  const contentClassName = useMemo(
    () =>
      cn(
        'flex h-full flex-col gap-0 overflow-hidden border-l border-white/8 p-0',
        SURFACE_CLASS_NAMES[surface],
        WIDTH_CLASS_NAMES[width],
        className,
      ),
    [className, surface, width],
  );

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className={contentClassName}
        aria-describedby={description ? `${id}-description` : undefined}
      >
        {(title || description || badges || actions) && (
          <div className="sticky top-0 z-10 border-b border-white/8 bg-background/92 px-6 pb-5 pt-6 backdrop-blur">
            <div className="flex items-start justify-between gap-4 pr-8">
              <SheetHeader className="space-y-3 text-left">
                {badges ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {badges}
                  </div>
                ) : null}
                {title ? <SheetTitle>{title}</SheetTitle> : null}
                {description ? (
                  <SheetDescription id={`${id}-description`}>
                    {description}
                  </SheetDescription>
                ) : null}
              </SheetHeader>
              {actions || onOpenDetail || canOpenAgent ? (
                <div className="shrink-0">
                  <div className="flex items-center gap-2">
                    {onOpenDetail ? (
                      <Button
                        label={openDetailLabel}
                        variant={ButtonVariant.SECONDARY}
                        icon={<HiArrowTopRightOnSquare className="h-4 w-4" />}
                        onClick={onOpenDetail}
                      />
                    ) : null}
                    {canOpenAgent ? (
                      <Button
                        label="Open agent"
                        variant={ButtonVariant.SECONDARY}
                        onClick={() =>
                          dispatchEntityOverlayOpenAgentRequested(id)
                        }
                      />
                    ) : null}
                    {actions}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {!title && !description ? (
          <div className="sr-only">
            <SheetHeader>
              <SheetTitle>Overlay</SheetTitle>
            </SheetHeader>
          </div>
        ) : null}

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-6 py-6',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer ? (
          <div className="border-t border-white/8 bg-background/94 px-6 py-4 backdrop-blur">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
