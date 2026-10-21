import type { AgentThreadUpdateFailure } from '@genfeedai/agent/hooks/use-agent-thread-update';
import { useTranslations } from 'next-intl';

interface AgentThreadUpdateNoticeProps {
  failure: AgentThreadUpdateFailure | null;
}

export function AgentThreadUpdateNotice({
  failure,
}: AgentThreadUpdateNoticeProps) {
  const translate = useTranslations('agent.threadRecovery');
  if (!failure) return null;

  return (
    <p className="text-xs text-destructive" role="alert">
      {translate(failure === 'missing-thread' ? 'unavailable' : 'failed')}
    </p>
  );
}
