import type { CameraMovementPreset } from '@cloud/interfaces/studio/camera-movement.interface';

export interface CameraMovementPromptBarProps {
  preset: CameraMovementPreset;
  customPrompt: string;
  onPresetChange: (preset: CameraMovementPreset) => void;
  onCustomPromptChange: (prompt: string) => void;
}
