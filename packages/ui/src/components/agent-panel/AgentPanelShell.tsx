'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
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
  title = 'Genfeed Terminal',
  subtitle = 'Conversation-scoped terminal runtime',
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
    <div className="flex h-full flex-col overflow-hidden bg-[#07111f] text-white">
      {/* Header */}
      <div className="flex h-[4.5rem] shrink-0 items-center justify-between border-b border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-3">
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 transition-all duration-200',
            !isOpen && 'w-0 overflow-hidden opacity-0 pointer-events-none',
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white/90">
              {title}
            </p>
            <p className="truncate text-xs text-white/45">{subtitle}</p>
          </div>

          {headerContent}

          {onExpand && (
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              onClick={onExpand}
              className="h-7 w-7 shrink-0 text-white/40 hover:text-white"
              ariaLabel="Open full chat workspace"
            >
              <HiArrowsPointingOut className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="flex items-center">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            onClick={onToggle}
            className={cn(
              'h-8 w-8 bg-transparent',
              isOpen
                ? 'text-white hover:bg-white/[0.06]'
                : 'text-primary hover:bg-primary/10',
            )}
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

      {/* Body */}
      <div
        data-panel-body=""
        className={cn(
          'flex flex-1 flex-col overflow-hidden transition-opacity duration-200',
          !isOpen && 'opacity-0 pointer-events-none',
        )}
      >
        <div className="shrink-0 border-b border-white/[0.08] px-3 py-2">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/20 p-1">
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              withWrapper={false}
              onClick={() => handleTabChange('chat')}
              className={cn(
                'w-full rounded-lg px-3 py-2 text-sm font-medium',
                activeTab === 'chat'
                  ? 'bg-white/[0.08] text-white'
                  : 'text-white/50 hover:text-white',
              )}
            >
              Terminal
            </Button>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              withWrapper={false}
              onClick={() => handleTabChange('outputs')}
              className={cn(
                'w-full rounded-lg px-3 py-2 text-sm font-medium',
                activeTab === 'outputs'
                  ? 'bg-white/[0.08] text-white'
                  : 'text-white/50 hover:text-white',
              )}
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
