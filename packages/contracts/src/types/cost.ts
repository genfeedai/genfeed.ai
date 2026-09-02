// =============================================================================
// CANONICAL COST TYPES
// =============================================================================

/** Per-node cost estimate (used in UI cost calculators and API cost services) */
export interface NodeCostEstimate {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  model: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  unit?: string;
  details?: string;
  duration?: number;
  withAudio?: boolean;
}

/** Aggregated cost breakdown for a workflow */
export interface CostBreakdown {
  total: number;
  items: NodeCostEstimate[];
}

/** Post-execution cost summary (estimated vs actual) */
export interface CostSummary {
  estimated: number;
  actual: number;
  variance: number;
}
