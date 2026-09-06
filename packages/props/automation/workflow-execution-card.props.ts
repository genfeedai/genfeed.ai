import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

export interface WorkflowExecutionCardProps {
  execution: IWorkflowExecution;
  onCancel?: (id: string) => void;
}

/** Narrow call signature a `next-intl` `useTranslations` result satisfies,
 * for passing translation into a plain helper function that cannot call
 * hooks itself. */
export type WorkflowExecutionTranslate = (
  key: string,
  values?: Record<string, number | string>,
) => string;
