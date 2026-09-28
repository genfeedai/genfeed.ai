import type {
  IBatchProject,
  IBatchProjectIdeaSettings,
  IBatchProjectItem,
  IBatchProjectScheduleTarget,
  ICredential,
} from '@genfeedai/contracts/interfaces';
export interface BatchProjectPageProps {
  projectId: string;
}
export interface BatchIdeasEditorProps {
  canGenerate: boolean;
  settings: IBatchProjectIdeaSettings;
  disabled: boolean;
  onChange: (settings: IBatchProjectIdeaSettings) => void;
  onGenerate: () => void;
}
export interface BatchWorkflowInputsProps {
  disabled: boolean;
  onUpload: (files: File[]) => void;
}
export interface BatchProjectItemCardProps {
  item: IBatchProjectItem;
  isDraft: boolean;
  disabled: boolean;
  onRemove: () => void;
  onRetry: () => void;
  onCaption: (caption: string) => void;
  onReview: (decision: 'approved' | 'rejected') => void;
}
export interface BatchScheduleProps {
  canSchedule: boolean;
  targets: IBatchProjectScheduleTarget[];
  credentials: ICredential[];
  disabled: boolean;
  onChange: (targets: IBatchProjectScheduleTarget[]) => void;
  onSchedule: () => void;
}
export interface BatchCollectionProps {
  projects: IBatchProject[];
  onDelete: (id: string) => void;
}
