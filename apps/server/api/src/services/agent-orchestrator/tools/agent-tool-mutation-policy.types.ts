import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

export type AgentMutationAuthorization =
  | {
      kind: 'execute';
      approvalId?: string;
      constraint?: 'proactive-text-draft-only';
    }
  | { kind: 'return'; result: AgentToolResult };
