import type { WorkflowEdge, WorkflowNode } from '@genfeedai/contracts/types';

export interface WorkflowSeed {
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
  workflowName: string;
}
