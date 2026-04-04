import type { EditorEffectType, EditorProjectStatus, EditorTrackType, EditorTransitionType, IngredientFormat } from '@genfeedai/enums';
import type { IBaseEntity, IBrand, IIngredient, IOrganization, IUser } from '../index';
export interface IEditorEffect {
    type: EditorEffectType;
    intensity: number;
}
export interface IEditorTransition {
    type: EditorTransitionType;
    duration: number;
}
export interface IEditorTextOverlay {
    text: string;
    position: {
        x: number;
        y: number;
    };
    fontSize: number;
    color: string;
    fontFamily?: string;
    fontWeight?: number;
    backgroundColor?: string;
    padding?: number;
}
export interface IEditorClip {
    id: string;
    ingredientId: string;
    ingredientUrl: string;
    thumbnailUrl?: string;
    startFrame: number;
    durationFrames: number;
    sourceStartFrame: number;
    sourceEndFrame: number;
    effects: IEditorEffect[];
    transitionIn?: IEditorTransition;
    transitionOut?: IEditorTransition;
    textOverlay?: IEditorTextOverlay;
    volume?: number;
}
export interface IEditorTrack {
    id: string;
    type: EditorTrackType;
    name: string;
    clips: IEditorClip[];
    isMuted: boolean;
    isLocked: boolean;
    volume: number;
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
    tracks: IEditorTrack[];
    settings: IEditorProjectSettings;
    totalDurationFrames: number;
    status: EditorProjectStatus;
    renderedVideo?: IIngredient | string;
    thumbnailUrl?: string;
}
export interface ICreateEditorProjectDto {
    name: string;
    settings?: Partial<IEditorProjectSettings>;
    sourceVideoId?: string;
}
export interface IUpdateEditorProjectDto {
    name?: string;
    tracks?: IEditorTrack[];
    settings?: Partial<IEditorProjectSettings>;
    totalDurationFrames?: number;
    thumbnailUrl?: string;
}
//# sourceMappingURL=editor-project.interface.d.ts.map