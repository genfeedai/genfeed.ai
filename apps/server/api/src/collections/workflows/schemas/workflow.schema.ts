export type {
  Workflow,
  Workflow as WorkflowDocument,
  WorkflowExecution as WorkflowExecutionDocument,
} from '@genfeedai/prisma';

export type WorkflowRecurrence = {
  type: string;
  timezone?: string;
  endDate?: Date;
  nextRunAt?: Date;
};

export type WorkflowVisualNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, unknown>;
    inputVariableKeys?: string[];
  };
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

export type WorkflowInputVariable = {
  key: string;
  type: string;
  label: string;
  description?: string;
  defaultValue?: unknown;
  required: boolean;
};
