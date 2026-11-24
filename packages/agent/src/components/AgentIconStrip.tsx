'use client';

import { AGENT_PANEL_ICON_STRIP_WIDTH } from '@genfeedai/agent/constants/agent-panel.constant';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Sparkles } from 'lucide-react';
import type { ReactElement } from 'react';

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
      <div className="flex h-16 items-center justify-end border-b border-foreground/10 px-2 overflow-visible">
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={onExpand}
          ariaLabel="Expand agent sidebar"
        >
          <Sparkles className="size-4 text-primary" />
        </Button>
      </div>
      <div className="flex-1" />
    </div>
  );
}
