import type { AgentApiService } from '@genfeedai/agent';

import type { PropsWithChildren } from 'react';

export type AgentWorkspaceLayoutClientProps = PropsWithChildren<{
  readonly agentApiService?: AgentApiService;
}>;
