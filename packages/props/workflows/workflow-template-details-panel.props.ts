import type { WorkflowTemplateCardPreviewProps } from './workflow-template-card-preview.props';

export interface WorkflowTemplateDetailsPanelProps {
  actionLabel: string;
  categoryLabel: string;
  changeSummary?: string;
  description: string;
  href?: string;
  /** Identity of the selected template; `null` leaves the sidebar alone. */
  id: string | null;
  isInstalling?: boolean;
  onClose: () => void;
  onInstall?: () => void;
  preview?: WorkflowTemplateCardPreviewProps;
  scheduleLabel?: string | null;
  sourceLabel: string;
  title: string;
}
