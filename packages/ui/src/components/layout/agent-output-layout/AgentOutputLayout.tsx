'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AgentOutputLayoutProps } from '@genfeedai/props/ui/agent-output-shell.props';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { Button } from '@ui/primitives/button';
import { Maximize2, Minimize2 } from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

type MobileView = 'agent' | 'output';

// One fixed height for every pane header: a header that grows with its content
// would push the divider lines out of line with the pane beside it.
const HEADER_CLASS_NAME =
  'flex h-12 shrink-0 items-center gap-2 border-b border-border px-4';

// The agent pane's share of the two-pane width when the divider is draggable.
const AGENT_SHARE_DEFAULT = 0.5;
const AGENT_SHARE_MIN = 0.3;
const AGENT_SHARE_MAX = 0.7;
const AGENT_SHARE_STEP = 0.02;
const AGENT_SHARE_STEP_LARGE = 0.05;

function clampAgentShare(share: number): number {
  return Math.min(AGENT_SHARE_MAX, Math.max(AGENT_SHARE_MIN, share));
}

function readStoredAgentShare(storageKey: string): number {
  try {
    const stored = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0
      ? clampAgentShare(stored)
      : AGENT_SHARE_DEFAULT;
  } catch {
    return AGENT_SHARE_DEFAULT;
  }
}

function storeAgentShare(storageKey: string, share: number): void {
  try {
    window.localStorage.setItem(storageKey, share.toFixed(3));
  } catch {
    // Storage blocked (private window): the split still works for the visit.
  }
}

/**
 * The agent on the left and the page output on the right, half the page each
 * on every page. Both panes stay mounted at every width so a draft or a
 * running stream survives a tab or a mobile switch; below `xl` an Agent /
 * Output switch shows one at a time.
 *
 * Whenever any pane has a header, every pane has one at the same fixed height,
 * so the divider lines between the panes always meet.
 *
 * Pure layout: the conversation, the tabs' content and their labels all come
 * in as props, so any app and any agent can sit in it.
 */
export default function AgentOutputLayout({
  activeTabId,
  agent,
  agentHeader,
  className,
  headerActions,
  isOutputExpandable = false,
  isOutputHidden = false,
  labels,
  preview,
  resizeStorageKey,
  tabs,
}: AgentOutputLayoutProps) {
  const [mobileView, setMobileView] = useState<MobileView>('agent');
  const [isOutputExpanded, setIsOutputExpanded] = useState(false);
  const [agentShare, setAgentShare] = useState(AGENT_SHARE_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);
  const panesRef = useRef<HTMLDivElement>(null);
  const isAgentHidden = isOutputExpandable && isOutputExpanded;
  const isOutputCollapsed = isOutputHidden && !isAgentHidden;
  const isResizable =
    Boolean(resizeStorageKey) && !isAgentHidden && !isOutputCollapsed;

  // The stored split is read after mount: the server render has no storage.
  useEffect(() => {
    if (resizeStorageKey) {
      setAgentShare(readStoredAgentShare(resizeStorageKey));
    }
  }, [resizeStorageKey]);

  const commitAgentShare = useCallback(
    (share: number) => {
      const next = clampAgentShare(share);
      setAgentShare(next);
      if (resizeStorageKey) {
        storeAgentShare(resizeStorageKey, next);
      }
    },
    [resizeStorageKey],
  );

  const shareAtPointer = useCallback((clientX: number): number | null => {
    const bounds = panesRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) {
      return null;
    }
    return clampAgentShare((clientX - bounds.left) / bounds.width);
  }, []);

  const handleDividerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsResizing(true);
    },
    [],
  );

  const handleDividerPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isResizing) {
        return;
      }
      const share = shareAtPointer(event.clientX);
      if (share !== null) {
        setAgentShare(share);
      }
    },
    [isResizing, shareAtPointer],
  );

  const handleDividerPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isResizing) {
        return;
      }
      setIsResizing(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      commitAgentShare(shareAtPointer(event.clientX) ?? agentShare);
    },
    [agentShare, commitAgentShare, isResizing, shareAtPointer],
  );

  const handleDividerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? AGENT_SHARE_STEP_LARGE : AGENT_SHARE_STEP;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        commitAgentShare(agentShare - step);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        commitAgentShare(agentShare + step);
      } else if (event.key === 'Home') {
        event.preventDefault();
        commitAgentShare(AGENT_SHARE_DEFAULT);
      }
    },
    [agentShare, commitAgentShare],
  );

  const paneShareStyle = isResizable
    ? ({
        '--agent-pane-share': `${agentShare}fr`,
        '--output-pane-share': `${1 - agentShare}fr`,
      } as CSSProperties)
    : undefined;
  const hasHeaders =
    agentHeader !== undefined ||
    Boolean(headerActions) ||
    isOutputExpandable ||
    preview !== undefined;

  return (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background',
        className,
      )}
      data-mobile-view={mobileView}
      data-testid="agent-output-layout"
    >
      <div
        className="shrink-0 border-b border-border px-3 py-2 xl:hidden"
        hidden={isOutputCollapsed}
      >
        <ViewMenu
          activeView={mobileView}
          onChange={setMobileView}
          options={[
            { icon: null, label: labels.agent, type: 'agent' },
            { icon: null, label: labels.output, type: 'output' },
          ]}
          trigger="label"
        />
      </div>

      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1',
          (isAgentHidden || isOutputCollapsed) &&
            'xl:grid-cols-[minmax(0,1fr)]',
          !isAgentHidden &&
            !isOutputCollapsed &&
            // A draggable divider sets the two shares; otherwise half each.
            'xl:grid-cols-[minmax(0,var(--agent-pane-share,1fr))_minmax(0,var(--output-pane-share,1fr))]',
          // The preview docks as a third column only where all three fit; the
          // agent and the output keep their split beside it.
          preview &&
            (isAgentHidden
              ? '2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]'
              : '2xl:grid-cols-[minmax(0,var(--agent-pane-share,1fr))_minmax(0,var(--output-pane-share,1fr))_minmax(22rem,0.9fr)]'),
          isResizing && 'cursor-col-resize select-none',
        )}
        data-resizing={isResizing ? 'true' : undefined}
        ref={panesRef}
        style={paneShareStyle}
      >
        <section
          aria-label={labels.agent}
          className={cn(
            'relative flex min-h-0 min-w-0 flex-col border-border',
            !isOutputCollapsed && 'xl:border-r',
            mobileView === 'output' && !isOutputCollapsed && 'max-xl:hidden',
            isAgentHidden && 'xl:hidden',
          )}
          data-testid="agent-output-agent-pane"
        >
          {hasHeaders ? (
            <header className={HEADER_CLASS_NAME}>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {agentHeader}
              </div>
            </header>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col">{agent}</div>
          {isResizable ? (
            // Sits on the pane border: drag it, use the arrow keys, or
            // double-click it to go back to half and half.
            <Button
              aria-orientation="vertical"
              aria-valuemax={Math.round(AGENT_SHARE_MAX * 100)}
              aria-valuemin={Math.round(AGENT_SHARE_MIN * 100)}
              aria-valuenow={Math.round(agentShare * 100)}
              ariaLabel={labels.resizePanes}
              className="group/divider absolute inset-y-0 -right-1.5 z-30 hidden w-3 cursor-col-resize touch-none outline-none xl:block"
              data-testid="agent-output-divider"
              onDoubleClick={() => commitAgentShare(AGENT_SHARE_DEFAULT)}
              onKeyDown={handleDividerKeyDown}
              onPointerCancel={handleDividerPointerUp}
              onPointerDown={handleDividerPointerDown}
              onPointerMove={handleDividerPointerMove}
              onPointerUp={handleDividerPointerUp}
              role="separator"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors',
                  isResizing
                    ? 'bg-primary/60'
                    : 'bg-transparent group-hover/divider:bg-primary/40 group-focus-visible/divider:bg-primary/60',
                )}
              />
            </Button>
          ) : null}
        </section>

        <section
          aria-label={labels.output}
          className={cn(
            'flex min-h-0 min-w-0 flex-col',
            mobileView === 'agent' && 'max-xl:hidden',
            isOutputCollapsed && 'hidden',
          )}
          data-testid="agent-output-output-pane"
          hidden={isOutputCollapsed}
        >
          {hasHeaders ? (
            <header className={cn(HEADER_CLASS_NAME, 'justify-end')}>
              {headerActions}
              {isOutputExpandable ? (
                <Button
                  ariaLabel={
                    isOutputExpanded
                      ? labels.collapseOutput
                      : labels.expandOutput
                  }
                  className="max-xl:hidden"
                  data-testid="agent-output-expand-output"
                  icon={
                    isOutputExpanded ? (
                      <Minimize2 className="size-4" />
                    ) : (
                      <Maximize2 className="size-4" />
                    )
                  }
                  onClick={() => setIsOutputExpanded((current) => !current)}
                  size={ButtonSize.SM}
                  tooltip={
                    isOutputExpanded
                      ? labels.collapseOutput
                      : labels.expandOutput
                  }
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
              ) : null}
            </header>
          ) : null}
          {/* Every tab stays mounted: the page output keeps its scroll and
              unsaved edits while Threads or Context is showing. */}
          {tabs.map((tab) => (
            <div
              aria-label={tab.label}
              className="min-h-0 flex-1 flex-col overflow-y-auto data-[state=active]:flex data-[state=inactive]:hidden"
              data-state={tab.id === activeTabId ? 'active' : 'inactive'}
              hidden={tab.id !== activeTabId}
              key={tab.id}
              role="tabpanel"
            >
              {tab.content}
            </div>
          ))}
        </section>

        {preview ? (
          <section
            aria-label={preview.label}
            className="flex min-h-0 min-w-0 flex-col border-border max-2xl:hidden 2xl:border-l"
            data-testid="agent-output-preview-pane"
          >
            <header className={HEADER_CLASS_NAME}>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {preview.label}
              </span>
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {preview.content}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
