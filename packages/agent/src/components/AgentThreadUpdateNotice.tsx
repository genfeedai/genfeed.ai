import type { AgentThreadUpdateFailure } from '@genfeedai/agent/hooks/use-agent-thread-update';
import { Alert } from '@ui/primitives/alert';
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
    <Alert size="sm" variant="destructive">
      {translate(failure === 'missing-thread' ? 'unavailable' : 'failed')}
    </Alert>
  );
}
