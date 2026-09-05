import type { ILlmVendorCostRecordInput } from '../../interfaces/billing/llm-vendor-cost.interface';
export interface LlmCostSettlementJobData extends ILlmVendorCostRecordInput {
  workflowLedgerId: string;
}
