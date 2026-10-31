'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { WorkspacePanelHeaderProps } from '@props/ui/workspace-panel.props';
import { Button } from '@ui/primitives/button';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import {
  BotMessageSquare,
  History,
  type LucideIcon,
  Maximize2,
  SquarePen,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * The sidebar and compact sheet share one header. The topbar's Chat and
 * Context toggles choose the view; this bar names it and holds its actions.
 * History is a part of Chat, so it opens from the Chat header.
 */
export default function WorkspacePanelHeader({
  activeView,
  hasAgent,
  onClose,
  onNewThread,
  onOpenFullPage,
  onSelectView,
}: WorkspacePanelHeaderProps) {
  const translate = useTranslations('common.sidePanel');
  const viewTitle = {
    agent: translate('chat'),
    details: translate('context'),
    history: translate('history'),
  }[activeView];

  const renderAction = ({
    icon: Icon,
    label,
    onClick,
    testId,
  }: {
    icon: LucideIcon;
    label: string;
    onClick?: () => void;
    testId: string;
  }) => (
    <Button
      ariaLabel={label}
      className={SHELL_ICON_BUTTON_CLASS}
      data-testid={testId}
      icon={<Icon className={SHELL_ICON_CLASS} />}
      isDisabled={!onClick}
      onClick={onClick}
      size={ButtonSize.ICON}
      tooltip={label}
      variant={ButtonVariant.GHOST}
      withWrapper={false}
    />
  );

  return (
    <div
      className="flex h-12 shrink-0 items-center gap-0.5 border-b border-border px-2"
      data-testid="workspace-panel-header"
    >
      <h2
        className="min-w-0 truncate px-2 text-sm font-medium text-foreground"
        data-testid="workspace-panel-title"
      >
        {viewTitle}
      </h2>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {hasAgent && activeView === 'agent'
          ? renderAction({
              icon: History,
              label: translate('history'),
              onClick: () => onSelectView('history'),
              testId: 'workspace-panel-history',
            })
          : null}
        {hasAgent && activeView === 'history'
          ? renderAction({
              icon: BotMessageSquare,
              label: translate('backToChat'),
              onClick: () => onSelectView('agent'),
              testId: 'workspace-panel-back',
            })
          : null}
        {hasAgent && activeView !== 'details'
          ? renderAction({
              icon: SquarePen,
              label: translate('newThread'),
              onClick: onNewThread,
              testId: 'workspace-panel-new-thread',
            })
          : null}
        {hasAgent && activeView === 'agent'
          ? renderAction({
              icon: Maximize2,
              label: translate('openFullPage'),
              onClick: onOpenFullPage,
              testId: 'workspace-panel-full-page',
            })
          : null}
        {renderAction({
          icon: X,
          label: translate('close'),
          onClick: onClose,
          testId: 'workspace-panel-close',
        })}
      </div>
    </div>
  );
}
