import type { AgentUiAction } from './agent-ui-action.interface';

export interface AgentToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  creditsUsed: number;
  /**
   * True when the downstream generation endpoint bills the call itself
   * (dynamic amount). The orchestrator must not deduct its flat creditCost
   * again for these results.
   */
  isBillingDelegated?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
  requiresConfirmation?: boolean;
  nextActions?: AgentUiAction[];
  approvalId?: string;
  approvalStatus?: 'pending' | 'approved' | 'declined';
  mutationPolicy?: 'approval-required' | 'direct';
}
