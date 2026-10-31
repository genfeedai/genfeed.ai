'use client';

import { ButtonSize } from '@genfeedai/contracts';
import type { ConnectAgentButtonProps } from '@props/website/connect-agent-button.props';
import { AGENT_CONNECT_EVENT } from '@web-components/buttons/connect-agent/connect-agent.event';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';

export default function ConnectAgentButton({
  className,
  label,
  size = ButtonSize.PUBLIC,
  trackingName,
  trackingAction = 'connect_agent',
  variant,
}: ConnectAgentButtonProps) {
  return (
    <ButtonTracked
      aria-haspopup="dialog"
      className={className}
      label={label}
      onClick={() => window.dispatchEvent(new Event(AGENT_CONNECT_EVENT))}
      size={size}
      trackingData={{ action: trackingAction }}
      trackingName={trackingName}
      type="button"
      variant={variant}
      withWrapper={false}
    />
  );
}
