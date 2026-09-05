import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

export type AgentMutationAuthorization =
  | { kind: 'execute'; approvalId?: string }
  | { kind: 'return'; result: AgentToolResult };
