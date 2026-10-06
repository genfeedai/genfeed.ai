'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { AgentDockSuggestedAction } from '@props/ui/agent-dock.props';
import { Button } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { MessageCircle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

type AgentConversationBubbleProps = {
  readonly isDismissed?: boolean;
  readonly isOpen?: boolean;
  readonly onOpen: () => void;
  readonly onSelectSuggestedAction?: (prompt: string) => void;
  readonly suggestedActions?: readonly AgentDockSuggestedAction[];
};

const RADIAL_LIMIT = 3;
// size-8 shortcuts on this 72° arc. 58px keeps about a 4px gap between
// neighbours and sits them just outside the size-12 bubble.
const ARC_RADIUS_PX = 58;

function actionExplanation(action: AgentDockSuggestedAction): string {
  return action.description?.trim() || action.prompt.trim();
}

function arcOffset(index: number, count: number): { x: number; y: number } {
  const startDeg = 168;
  const endDeg = 96;
  const t = count <= 1 ? 0 : index / (count - 1);
  const deg = startDeg + (endDeg - startDeg) * t;
  const rad = (deg * Math.PI) / 180;
  return {
    x: Math.cos(rad) * ARC_RADIUS_PX,
    y: -Math.sin(rad) * ARC_RADIUS_PX,
  };
}

const SHORTCUT_HIDE_MS = 200;

/**
 * Closed agent chrome: one chat bubble. Page shortcuts stay on the arc and
 * appear only while the bubble is hovered or focused. There is no
 * floating-action-button primitive; the bubble is the shared icon button.
 * The translate stays on the wrapper. The button's own transition animates
 * transform, which would fight this offset.
 */
export default function AgentConversationBubble({
  isDismissed = false,
  isOpen = false,
  onOpen,
  onSelectSuggestedAction,
  suggestedActions = [],
}: AgentConversationBubbleProps) {
  const translate = useTranslations('common.agentDock');
  const actions = suggestedActions.slice(0, RADIAL_LIMIT);
  const [areShortcutsVisible, setAreShortcutsVisible] = useState(false);
  const shouldShowShortcuts = areShortcutsVisible && !isOpen;
  const hideTimerRef = useRef<number | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const showShortcuts = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setAreShortcutsVisible(true);
  };

  const hideShortcuts = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      if (!bubbleRef.current?.contains(document.activeElement)) {
        setAreShortcutsVisible(false);
      }
    }, SHORTCUT_HIDE_MS);
  };

  useEffect(
    () => () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    },
    [],
  );

  return (
    <div
      ref={bubbleRef}
      onFocus={showShortcuts}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          hideShortcuts();
        }
      }}
      aria-hidden={isDismissed}
      inert={isDismissed}
      className={`pointer-events-none absolute bottom-5 right-5 z-30 transition-opacity duration-150 motion-reduce:transition-none ${
        isDismissed ? 'opacity-0 [&_button]:pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="relative size-12">
        {actions.map((action, index) => {
          const explanation = actionExplanation(action);
          const key = action.id ?? `${action.label}-${action.prompt}`;
          const { x, y } = arcOffset(index, actions.length);

          return (
            <div
              className={cn(
                'absolute z-10 transition-opacity duration-150 motion-reduce:transition-none',
                shouldShowShortcuts
                  ? 'pointer-events-auto opacity-100'
                  : 'pointer-events-none opacity-0',
              )}
              aria-hidden={!shouldShowShortcuts}
              inert={!shouldShowShortcuts}
              key={key}
              onPointerEnter={showShortcuts}
              onPointerLeave={hideShortcuts}
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              }}
            >
              <SimpleTooltip
                contentClassName="max-w-56 whitespace-normal text-left font-normal leading-snug"
                label={explanation}
                position="left"
              >
                <Button
                  ariaLabel={`${action.label}. ${explanation}`}
                  className="flex size-8 items-center justify-center overflow-visible rounded-full border border-border bg-background p-0 text-foreground shadow-md [&_svg]:!size-4"
                  data-testid="agent-conversation-radial"
                  onClick={() => onSelectSuggestedAction?.(action.prompt)}
                  tabIndex={shouldShowShortcuts && !isDismissed ? 0 : -1}
                  textTransform="none"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  {action.icon ?? (
                    <span className="text-2xs font-medium">
                      {action.label.slice(0, 1)}
                    </span>
                  )}
                  <span className="sr-only">{action.label}</span>
                </Button>
              </SimpleTooltip>
            </div>
          );
        })}
        <Button
          aria-controls="workspace-agent-dock"
          aria-expanded={isOpen}
          ariaLabel={translate(isOpen ? 'close' : 'open')}
          className="pointer-events-auto relative z-20 flex size-12 items-center justify-center rounded-full shadow-lg motion-safe:hover:scale-105 motion-safe:active:scale-95"
          data-testid="agent-conversation-bubble"
          onClick={onOpen}
          onPointerEnter={showShortcuts}
          onPointerLeave={hideShortcuts}
          tabIndex={isDismissed ? -1 : 0}
          size={ButtonSize.ICON}
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        >
          <MessageCircle
            aria-hidden="true"
            className={cn(
              'absolute size-5 transition-[transform,opacity] duration-200 motion-reduce:transition-none',
              isOpen
                ? '-rotate-90 scale-50 opacity-0'
                : 'rotate-0 scale-100 opacity-100',
            )}
          />
          <X
            aria-hidden="true"
            className={cn(
              'absolute size-5 transition-[transform,opacity] duration-200 motion-reduce:transition-none',
              isOpen
                ? 'rotate-0 scale-100 opacity-100'
                : 'rotate-90 scale-50 opacity-0',
            )}
          />
        </Button>
      </div>
    </div>
  );
}
