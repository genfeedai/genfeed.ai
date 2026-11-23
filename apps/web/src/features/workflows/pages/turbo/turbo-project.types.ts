import type {
  ICredential,
  ITurboProject,
  ITurboProjectIdeaSettings,
  ITurboProjectItem,
  ITurboProjectScheduleTarget,
} from '@genfeedai/contracts/interfaces';
/** One fetched page of the brand's Turbo projects. */
export interface TurboProjectsPage {
  hasMore: boolean;
  items: ITurboProject[];
}
export interface TurboProjectPageProps {
  projectId: string;
}
export interface TurboIdeasEditorProps {
  canGenerate: boolean;
  isAvatarReady: boolean;
  name: string;
  settings: ITurboProjectIdeaSettings;
  disabled: boolean;
  onChange: (settings: ITurboProjectIdeaSettings) => void;
  onGenerate: () => void;
  onNameChange: (name: string) => void;
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
  onReview: (decision: 'approved' | 'rejected', reason?: string) => void;
}
export interface TurboScheduleProps {
  canSchedule: boolean;
  targets: ITurboProjectScheduleTarget[];
  credentials: ICredential[];
  disabled: boolean;
  onChange: (targets: ITurboProjectScheduleTarget[]) => void;
  onSchedule: () => void;
}
