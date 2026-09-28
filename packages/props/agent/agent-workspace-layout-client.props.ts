import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';

import type { PropsWithChildren } from 'react';

export type AgentWorkspaceLayoutClientProps = PropsWithChildren<{
  readonly agentApiService?: AgentApiService;
}>;
