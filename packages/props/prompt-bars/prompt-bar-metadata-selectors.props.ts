import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type {
  IElementCamera,
  IElementCameraMovement,
  IElementLens,
  IElementLighting,
  IElementMood,
  IElementScene,
  IElementStyle,
  IFontFamily,
  IPreset,
} from '@genfeedai/interfaces';
import type { PromptBarConfig } from '@props/studio/prompt-bar.props';
import type { UseFormReturn } from 'react-hook-form';

export interface PromptBarMetadataSelectorsProps {
  currentConfig: PromptBarConfig;
  filteredPresets: IPreset[];
  profiles: Array<{ id: string; name: string; description?: string }>;
  filteredScenes: IElementScene[];
  filteredFontFamilies: IFontFamily[];
  filteredStyles: IElementStyle[];
  filteredCameras: IElementCamera[];
  filteredLightings: IElementLighting[];
  filteredLenses: IElementLens[];
  filteredCameraMovements: IElementCameraMovement[];
  filteredMoods: IElementMood[];
  form: UseFormReturn<PromptTextareaSchema>;

  selectedPreset: string;
  setSelectedPreset: (value: string) => void;
  selectedProfile: string;
  setSelectedProfile: (value: string) => void;

  refocusTextarea: () => void;
  isDisabledState: boolean;
  controlClass: string;
  triggerDisplay?: 'default' | 'icon-only';
  onTextChange?: (text: string) => void;
  triggerConfigChange?: () => void;
  onModelSelect?: (modelKey: string) => void;
}
