'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useState,
} from 'react';
import {
  HiArrowsPointingOut,
  HiOutlineSparkles,
  HiSparkles,
} from 'react-icons/hi2';

export interface AgentPanelShellProps {
  isOpen: boolean;
  onToggle: () => void;
  chatContent: ReactNode;
  outputsContent?: ReactNode;
  headerContent?: ReactNode;
  onExpand?: () => void;
  onTabChange?: (tab: 'chat' | 'outputs') => void;
  defaultTab?: 'chat' | 'outputs';
  title?: string;
  subtitle?: string;
}

type AgentRailTab = 'chat' | 'outputs';

function AgentPanelShell({
  isOpen,
  onToggle,
  chatContent,
  outputsContent,
  headerContent,
  onExpand,
  onTabChange,
  defaultTab = 'chat',
  title = 'Console',
  subtitle = 'Thread transcript and runtime routing',
}: AgentPanelShellProps): ReactElement {
  const [activeTab, setActiveTab] = useState<AgentRailTab>(defaultTab);

  const handleTabChange = useCallback(
    (tab: AgentRailTab) => {
      setActiveTab(tab);
      onTabChange?.(tab);
    },
    [onTabChange],
  );

  return (
    <div
      data-agent-console="true"
      className="gen-shell-panel gen-shell-panel--terminal flex h-full min-h-0 flex-col overflow-hidden text-foreground"
    >
      <div className="gen-shell-toolbar flex min-h-[3.75rem] shrink-0 items-center justify-between gap-3 px-3.5 py-2.5">
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3.5 transition-all duration-200',
            !isOpen && 'w-0 overflow-hidden opacity-0 pointer-events-none',
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[1.02rem] font-semibold tracking-[-0.02em] text-foreground">
              {title}
            </p>
            <p className="truncate text-xs text-foreground/55">{subtitle}</p>
          </div>

          {headerContent}

          {onExpand && (
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={onExpand}
              className="gen-shell-control h-9 w-9 shrink-0 rounded-md"
              ariaLabel="Open full chat workspace"
            >
              <HiArrowsPointingOut className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center">
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={onToggle}
            className="gen-shell-control h-9 w-9 rounded-lg"
            data-active={isOpen ? 'true' : 'false'}
            ariaLabel={
              isOpen ? 'Collapse quick ask panel' : 'Expand quick ask panel'
            }
          >
            {isOpen ? (
              <HiSparkles className="h-4 w-4" />
            ) : (
              <HiOutlineSparkles className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div
        data-panel-body=""
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity duration-200',
          !isOpen && 'opacity-0 pointer-events-none',
        )}
      >
        <div className="shrink-0 px-3.5 py-2.5">
          <div className="gen-shell-segmented grid grid-cols-2 gap-1 rounded-md p-1">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => handleTabChange('chat')}
              className="gen-shell-segmented-button h-9 w-full rounded-lg px-3.5 text-xs font-semibold uppercase tracking-[0.12em]"
              data-active={activeTab === 'chat' ? 'true' : 'false'}
            >
              Terminal
            </Button>
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => handleTabChange('outputs')}
              className="gen-shell-segmented-button h-9 w-full rounded-lg px-3.5 text-xs font-semibold uppercase tracking-[0.12em]"
              data-active={activeTab === 'outputs' ? 'true' : 'false'}
            >
              Outputs
            </Button>
          </div>
        </div>

        <div
          className={cn(
            'flex-1 overflow-hidden',
            activeTab !== 'chat' && 'hidden',
          )}
        >
          {chatContent}
        </div>

        {outputsContent && (
          <div
            className={cn(
              'flex-1 overflow-hidden',
              activeTab !== 'outputs' && 'hidden',
            )}
          >
            {outputsContent}
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentPanelShell;
