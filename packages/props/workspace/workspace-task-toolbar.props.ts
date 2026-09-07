import type { WorkspaceTaskMode } from '@props/workspace/workspace-task-composer.props';

export interface TaskPreset {
  label: string;
  outputType:
    | 'post'
    | 'newsletter'
    | 'image'
    | 'video'
    | 'facecam'
    | 'caption'
    | 'ingredient';
}

export interface TaskModeOption {
  description: string;
  id: WorkspaceTaskMode;
  label: string;
}

export interface WorkspaceTaskToolbarProps {
  isEnhancementBusy: boolean;
  hasPreviousRequest: boolean;
  hasRequest: boolean;
  modeOptions: TaskModeOption[];
  onEnhance: () => void;
  onOutputTypeChange: (outputType: TaskPreset['outputType']) => void;
  onTaskModeChange: (mode: WorkspaceTaskMode) => void;
  onUndoEnhancement: () => void;
  outputType: TaskPreset['outputType'];
  presets: TaskPreset[];
  taskMode: WorkspaceTaskMode;
}
