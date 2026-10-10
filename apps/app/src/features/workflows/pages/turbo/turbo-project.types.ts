import type {
  ITurboProject,
  ITurboProjectIdeaSettings,
  ITurboProjectItem,
  ITurboProjectScheduleTarget,
  ICredential,
} from '@genfeedai/contracts/interfaces';
export interface TurboProjectPageProps {
  projectId: string;
}
export interface TurboIdeasEditorProps {
  canGenerate: boolean;
  settings: ITurboProjectIdeaSettings;
  disabled: boolean;
  onChange: (settings: ITurboProjectIdeaSettings) => void;
  onGenerate: () => void;
}
export interface TurboWorkflowInputsProps {
  disabled: boolean;
  onUpload: (files: File[]) => void;
}
export interface TurboProjectItemCardProps {
  item: ITurboProjectItem;
  isDraft: boolean;
  disabled: boolean;
  onRemove: () => void;
  onRetry: () => void;
  onCaption: (caption: string) => void;
  onReview: (decision: 'approved' | 'rejected') => void;
}
export interface TurboScheduleProps {
  canSchedule: boolean;
  targets: ITurboProjectScheduleTarget[];
  credentials: ICredential[];
  disabled: boolean;
  onChange: (targets: ITurboProjectScheduleTarget[]) => void;
  onSchedule: () => void;
}
export interface TurboRunCollectionProps {
  projects: ITurboProject[];
  onDelete: (id: string) => void;
}
