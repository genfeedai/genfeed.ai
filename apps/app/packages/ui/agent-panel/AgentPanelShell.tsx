'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Button from '@ui/buttons/base/Button';
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
  onExpand,
  onTabChange,
  defaultTab = 'chat',
  title = 'Agent Rail',
  subtitle = 'Chat on this page or jump to outputs without leaving context.',
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] px-3">
        <div
          className={cn(
            'flex min-w-0 items-center gap-2 transition-all duration-200',
            !isOpen && 'w-0 overflow-hidden opacity-0 pointer-events-none',
          )}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground/90">
              {title}
            </p>
            <p className="truncate text-xs text-foreground/45">{subtitle}</p>
          </div>

          {onExpand && (
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              onClick={onExpand}
              className="h-7 w-7 shrink-0 text-foreground/40 hover:text-foreground"
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
                ? 'text-foreground hover:bg-white/[0.06]'
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
          'relative flex-1 overflow-hidden transition-opacity duration-200',
          !isOpen && 'opacity-0 pointer-events-none',
        )}
      >
        <div className="border-b border-white/[0.08] px-3 py-2">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.03] p-1">
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => handleTabChange('chat')}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                activeTab === 'chat'
                  ? 'bg-white/[0.08] text-foreground'
                  : 'text-foreground/50 hover:text-foreground',
              )}
            >
              Chat
            </Button>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => handleTabChange('outputs')}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                activeTab === 'outputs'
                  ? 'bg-white/[0.08] text-foreground'
                  : 'text-foreground/50 hover:text-foreground',
              )}
            >
              Outputs
            </Button>
          </div>
        </div>

        <div className={cn('h-full', activeTab !== 'chat' && 'hidden')}>
          {chatContent}
        </div>

        {outputsContent && (
          <div className={cn('h-full', activeTab !== 'outputs' && 'hidden')}>
            {outputsContent}
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentPanelShell;
