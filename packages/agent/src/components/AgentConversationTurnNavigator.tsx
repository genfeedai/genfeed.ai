'use client';

import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

type AgentConversationTurnNavigatorProps = {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  timeline: TimelineEntry[];
};

type ConversationTurn = {
  id: string;
  label: string;
};

const ACTIVE_TURN_VIEWPORT_RATIO = 0.3;
const TURN_LABEL_MAX_LENGTH = 72;

function buildTurnLabel(content: string, index: number): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return `Prompt ${index + 1}`;
  }

  const excerpt =
    normalized.length > TURN_LABEL_MAX_LENGTH
      ? `${normalized.slice(0, TURN_LABEL_MAX_LENGTH - 1)}…`
      : normalized;
  return `Prompt ${index + 1}: ${excerpt}`;
}

/**
 * A compact turn minimap for long conversations. Each marker represents one
 * user prompt; the active marker follows the prompt nearest the viewport and
 * clicking a marker jumps to that turn.
 */
export function AgentConversationTurnNavigator({
  scrollContainerRef,
  timeline,
}: AgentConversationTurnNavigatorProps): ReactElement | null {
  const turns = useMemo<ConversationTurn[]>(() => {
    return timeline
      .filter((entry) => entry.kind === 'user-message')
      .map((entry, index) => ({
        id: entry.message.id,
        label: buildTurnLabel(entry.message.content, index),
      }));
  }, [timeline]);
  const turnIds = useMemo(() => turns.map((turn) => turn.id), [turns]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(
    () => turnIds.at(-1) ?? null,
  );

  const updateActiveTurn = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || turnIds.length === 0) {
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    const activationLine =
      containerTop + container.clientHeight * ACTIVE_TURN_VIEWPORT_RATIO;
    let nextActiveTurnId = turnIds[0] ?? null;

    for (const turnId of turnIds) {
      const element = document.getElementById(`agent-message-${turnId}`);
      if (!element || element.getBoundingClientRect().top > activationLine) {
        break;
      }
      nextActiveTurnId = turnId;
    }

    setActiveTurnId((current) =>
      current === nextActiveTurnId ? current : nextActiveTurnId,
    );
  }, [scrollContainerRef, turnIds]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || turnIds.length < 2) {
      return;
    }

    let animationFrameId: number | null = null;
    const scheduleUpdate = () => {
      if (animationFrameId !== null) {
        return;
      }
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        updateActiveTurn();
      });
    };

    scheduleUpdate();
    container.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      container.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [scrollContainerRef, turnIds.length, updateActiveTurn]);

  const handleTurnSelect = useCallback((turnId: string) => {
    const element = document.getElementById(`agent-message-${turnId}`);
    if (!element) {
      return;
    }

    setActiveTurnId(turnId);
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (turns.length < 2) {
    return null;
  }

  return (
    <nav
      aria-label="Conversation prompts"
      className="pointer-events-none absolute inset-y-0 left-2 z-10 hidden lg:flex"
    >
      {/*
        Cluster markers tightly in the vertical center — never justify-between
        across the full column (that scattered 2–4 ticks so far apart they were
        easy to miss and hard to scrub turn-to-turn).
      */}
      <div className="pointer-events-auto my-auto flex max-h-[min(70dvh,28rem)] min-h-0 flex-col items-center justify-center gap-0.5 overflow-y-auto py-2">
        {turns.map((turn) => {
          const isActive = turn.id === activeTurnId;
          return (
            <Button
              key={turn.id}
              aria-current={isActive ? 'location' : undefined}
              ariaLabel={turn.label}
              className="group flex h-4 w-7 shrink-0 items-center justify-center"
              onClick={() => handleTurnSelect(turn.id)}
              tooltip={turn.label}
              tooltipPosition="right"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-0.5 rounded-full transition-[width,background-color] duration-150',
                  isActive
                    ? 'w-3.5 bg-foreground/80'
                    : 'w-2 bg-muted-foreground/40 group-hover:w-3 group-hover:bg-muted-foreground/75',
                )}
              />
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
