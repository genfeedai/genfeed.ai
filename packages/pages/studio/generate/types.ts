import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type { IImage, IModel } from '@genfeedai/contracts/interfaces';
import type { CameraMovementPreset } from '@genfeedai/contracts/interfaces/studio/camera-movement.interface';

export interface UseStoryboardGenerationParams {
  brandId: string;
  currentModels: IModel[];
  findAllAssets: (
    page?: number,
    append?: boolean,
    skipLoadingState?: boolean,
    overrideBrandId?: string,
  ) => Promise<void>;
  promptConfig: Partial<Omit<PromptTextareaSchema, 'text'>> & {
    isValid: boolean;
  };
  promptText: string;
  setGeneratedAssetId: (id: string | null) => void;
}

export interface UseStoryboardGenerationReturn {
  appendStoryboardFrames: (frames: IImage[]) => void;
  cameraMovementPreset: CameraMovementPreset;
  clearStoryboard: () => void;
  customCameraPrompt: string;
  frames: IImage[];
  handleGenerateStoryboard: () => Promise<void>;
  hasInterpolationModel: boolean;
  isStoryboardGenerating: boolean;
  setCameraMovementPreset: (preset: CameraMovementPreset) => void;
  setCustomCameraPrompt: (prompt: string) => void;
  setFrames: React.Dispatch<React.SetStateAction<IImage[]>>;
}

// The Studio-generate domain shapes live in `@genfeedai/contracts/interfaces` so the
// props package can reference them without depending on `@genfeedai/pages`.
export type {
  StudioGenerateCapabilities,
  StudioGenerateJob,
  StudioGenerateRecipe,
  StudioGenerateRun,
  StudioGenerateSettings,
  StudioGenerateType,
  StudioGenerateTypeConfig,
} from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
