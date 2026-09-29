import type { WorkflowTemplateExampleOutput } from '@genfeedai/contracts/interfaces';
import type { WorkflowCardPreviewProps } from './workflow-card-preview.props';

export interface WorkflowTemplateCardPreviewProps
  extends Pick<WorkflowCardPreviewProps, 'edges' | 'name' | 'nodes'> {
  /** Shown instead of the workflow graph when present (#5498). */
  exampleOutput?: WorkflowTemplateExampleOutput | null;
}

export interface WorkflowTemplateExampleVideoProps {
  exampleOutput: WorkflowTemplateExampleOutput;
  label: string;
  onError: () => void;
}
