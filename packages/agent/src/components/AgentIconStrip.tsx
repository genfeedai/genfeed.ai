'use client';

import { AGENT_PANEL_ICON_STRIP_WIDTH } from '@genfeedai/agent/constants/agent-panel.constant';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import type { ReactElement } from 'react';
import { HiOutlineSparkles } from 'react-icons/hi2';

interface AgentIconStripProps {
  onExpand: () => void;
}

export function AgentIconStrip({
  onExpand,
}: AgentIconStripProps): ReactElement {
  return (
    <div
      className="flex h-full flex-col bg-background"
      style={{ width: AGENT_PANEL_ICON_STRIP_WIDTH }}
    >
      <div className="flex h-16 items-center justify-end border-b border-white/[0.08] px-2 overflow-visible">
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={onExpand}
          className="h-8 w-8 bg-transparent text-primary hover:bg-primary/10"
          ariaLabel="Expand agent sidebar"
        >
          <HiOutlineSparkles className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1" />
    </div>
  );
}
