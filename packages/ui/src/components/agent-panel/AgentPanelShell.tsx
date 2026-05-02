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
      <div className="gen-shell-toolbar flex shrink-0 items-center gap-2 px-2 py-1.5">
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 transition-all duration-200',
            !isOpen && 'w-0 overflow-hidden opacity-0 pointer-events-none',
          )}
        >
          <span className="shrink-0 text-[11px] font-semibold text-foreground">
            {title}
          </span>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {headerContent}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {isOpen && outputsContent && (
            <div className="gen-shell-segmented mr-1 flex gap-0.5 rounded-md p-0.5">
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => handleTabChange('chat')}
                className="gen-shell-segmented-button h-6 rounded-[5px] px-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
                data-active={activeTab === 'chat' ? 'true' : 'false'}
              >
                Terminal
              </Button>
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => handleTabChange('outputs')}
                className="gen-shell-segmented-button h-6 rounded-[5px] px-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
                data-active={activeTab === 'outputs' ? 'true' : 'false'}
              >
                Outputs
              </Button>
            </div>
          )}

          {isOpen && onExpand && (
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={onExpand}
              className="gen-shell-control h-7 w-7 rounded-md"
              ariaLabel="Open full chat workspace"
            >
              <HiArrowsPointingOut className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={onToggle}
            className="gen-shell-control h-7 w-7 rounded-md"
            data-active={isOpen ? 'true' : 'false'}
            ariaLabel={isOpen ? 'Collapse terminal' : 'Expand terminal'}
          >
            {isOpen ? (
              <HiSparkles className="h-3.5 w-3.5" />
            ) : (
              <HiOutlineSparkles className="h-3.5 w-3.5" />
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
