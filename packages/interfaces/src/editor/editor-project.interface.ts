import type {
  EditorEffectType,
  EditorProjectStatus,
  EditorTrackType,
  EditorTransitionType,
  IngredientFormat,
} from '@genfeedai/enums';
import type {
  IBaseEntity,
  IBrand,
  IIngredient,
  IOrganization,
  IUser,
} from '../index';

export interface IEditorEffect {
  type: EditorEffectType;
  intensity: number; // 0-100
}

export interface IEditorTransition {
  type: EditorTransitionType;
  duration: number; // in frames
}

export interface IEditorTextOverlay {
  text: string;
  position: { x: number; y: number }; // percentage-based positioning
  fontSize: number;
  color: string;
  fontFamily?: string;
  fontWeight?: number;
  backgroundColor?: string;
  padding?: number;
}

export interface IEditorClip {
  id: string;
  ingredientId: string; // Reference to video/audio/image ingredient
  ingredientUrl: string;
  thumbnailUrl?: string;

  // Timeline positioning (in frames)
  startFrame: number; // Where clip starts on timeline
  durationFrames: number; // How long clip appears on timeline

  // Source trimming (in frames)
  sourceStartFrame: number; // Where to start in source media
  sourceEndFrame: number; // Where to end in source media

  // Effects and transitions
  effects: IEditorEffect[];
  transitionIn?: IEditorTransition;
  transitionOut?: IEditorTransition;

  // For text tracks
  textOverlay?: IEditorTextOverlay;

  // Volume for audio/video
  volume?: number; // 0-100
}

export interface IEditorTrack {
  id: string;
  type: EditorTrackType;
  name: string;
  clips: IEditorClip[];
  isMuted: boolean;
  isLocked: boolean;
  volume: number; // 0-100, for audio tracks
}

export interface IEditorProjectSettings {
  format: IngredientFormat;
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
}

export interface IEditorProject extends IBaseEntity {
  name: string;
  organization: IOrganization | string;
  brand?: IBrand | string;
  user: IUser | string;

  // Project content
  tracks: IEditorTrack[];
  settings: IEditorProjectSettings;
  totalDurationFrames: number;

  // Status
  status: EditorProjectStatus;
  renderedVideo?: IIngredient | string;

  // Thumbnails
  thumbnailUrl?: string;
}

// DTO interfaces for API operations
export interface ICreateEditorProjectDto {
  name: string;
  settings?: Partial<IEditorProjectSettings>;
  sourceVideoId?: string; // Optional: start with existing video
}

export interface IUpdateEditorProjectDto {
  name?: string;
  tracks?: IEditorTrack[];
  settings?: Partial<IEditorProjectSettings>;
  totalDurationFrames?: number;
  thumbnailUrl?: string;
}
