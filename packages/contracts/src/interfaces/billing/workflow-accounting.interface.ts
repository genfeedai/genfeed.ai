/** Immutable estimates are credit quotes, never proof of a debit. */
export interface WorkflowNodeCostEstimate {
  nodeId: string;
  nodeType: string;
  model: string | null;
  provider: string | null;
  quantity: number | null;
  pricing: {
    pricingType: string | null;
    marginMultiplier: number;
    providerCostUsd: number | null;
    modelUpdatedAt: string;
  } | null;
  estimatedProviderCostMicros: number | null;
  estimatedCredits: number | null;
  pricingFingerprint: string | null;
  unresolvedReason: string | null;
}
export interface WorkflowCostEstimate {
  brandId: string | null;
  estimatedProviderCostMicros: number | null;
  knownEstimatedProviderCostMicros: number;
  version: 1;
  capturedAt: string;
  nodes: WorkflowNodeCostEstimate[];
  estimatedCredits: number | null;
  knownEstimatedCredits: number;
}
export interface WorkflowAccountingScope {
  organizationId: string;
  workflowExecutionId: string;
  workflowNodeId: string;
  workflowOperationId: string;
}
export interface WorkflowProviderCostBreakdown {
  model: string;
  provider: string;
  actualProviderCostMicros: number | null;
  knownProviderCostMicros: number;
}
export interface WorkflowNodeAccounting {
  providerBreakdown: WorkflowProviderCostBreakdown[];
  nodeId: string;
  estimatedCredits: number | null;
  actualCredits: number | null;
  knownActualCredits: number;
  refundedCredits: number;
  reservedCredits: number;
  varianceCredits: number | null;
  model: string | null;
  provider: string | null;
  actualProviderCostMicros: number | null;
  knownProviderCostMicros: number;
  unresolvedReasons: string[];
  state:
    | 'unestimated'
    | 'estimated'
    | 'reserved'
    | 'consuming'
    | 'reconciled'
    | 'refunded'
    | 'indeterminate';
}
export interface WorkflowAccounting {
  estimatedProviderCostMicros: number | null;
  varianceProviderCostMicros: number | null;
  actualProviderCostMicros: number | null;
  knownProviderCostMicros: number;
  estimate: WorkflowCostEstimate | null;
  nodes: WorkflowNodeAccounting[];
  actualCredits: number | null;
  knownActualCredits: number;
  estimatedCredits: number | null;
  varianceCredits: number | null;
}

export interface WorkflowCostReportExecution {
  id: string;
  workflowId: string;
  createdAt: string;
  accounting: WorkflowAccounting | null;
}
