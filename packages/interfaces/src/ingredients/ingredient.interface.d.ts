import { AssetScope, IngredientCategory, IngredientFormat, IngredientStatus, TransformationCategory } from '@genfeedai/enums';
import type { IAsset, IBaseEntity, IBrand, ICaption, IEvaluation, IFolder, IMetadata, IOrganization, IPost, IPrompt, ITag, ITraining, IUser } from '../index';
export interface IIngredient extends IBaseEntity {
    category: IngredientCategory;
    status: IngredientStatus;
    transformations?: TransformationCategory[];
    order?: number;
    version?: number;
    seed?: number;
    text?: string;
    user: IUser | string;
    organization: IOrganization | string;
    brand?: IBrand | string;
    parent?: IIngredient | string | null;
    sources?: IIngredient[] | string[];
    prompt?: IPrompt | string | null;
    script?: IIngredient | string;
    references?: IAsset[] | string[];
    metadata?: IMetadata | string;
    folder?: IFolder | string | null;
    training?: ITraining | string;
    model?: string;
    style?: string;
    provider?: string;
    camera?: string;
    mood?: string;
    blacklist?: string[];
    sounds?: string[];
    width?: number;
    height?: number;
    aspectRatio?: string;
    format?: IngredientFormat;
    ingredientFormat?: IngredientFormat;
    thumbnailUrl?: string;
    ingredientUrl?: string;
    brandLogoUrl?: string;
    metadataLabel?: string;
    metadataDescription?: string;
    metadataWidth?: number;
    metadataHeight?: number;
    metadataExtension?: string;
    metadataDuration?: number;
    metadataSize?: number;
    metadataModel?: string;
    metadataModelLabel?: string;
    metadataStyle?: string;
    metadataStatus?: string;
    metadataTags?: ITag[];
    promptText?: string;
    tags?: ITag[];
    posts?: IPost[];
    scope: AssetScope;
    isHighlighted: boolean;
    isDefault: boolean;
    isFavorite: boolean;
    isSelected?: boolean;
    isActive?: boolean;
    isPlaying?: boolean;
    totalVotes: number;
    totalChildren: number;
    hasVoted: boolean;
    isVoteAnimating: boolean;
    youtubeUrl?: string;
    tiktokUrl?: string;
    instagramUrl?: string;
    twitterUrl?: string;
    publishedAt?: string;
    personaSlug?: string;
    reviewStatus?: string;
    contentRating?: string;
    campaign?: string;
    evaluation?: IEvaluation | null;
}
export interface IVideoCaption {
    caption: ICaption | string;
    language: string;
    format: string;
}
export interface IVideo extends IIngredient {
    duration?: number;
    language?: string;
    resolution?: string;
    hasAudio?: boolean;
    promptTemplate?: string;
    templateVersion?: number;
}
export interface IImage extends IIngredient {
    colorSpace?: string;
    hasAlpha?: boolean;
    promptTemplate?: string;
    templateVersion?: number;
}
export interface IAudio extends IIngredient {
    duration?: number;
    isPlaying?: boolean;
}
export interface IMusic extends IIngredient {
    duration?: number;
    isPlaying?: boolean;
}
export interface IVoice extends IAudio {
    language?: string;
    gender?: string;
    isPlaying?: boolean;
}
export interface IAvatar extends IIngredient {
    voice?: IVoice;
    duration?: number;
}
export interface IGIF extends IIngredient {
    duration?: number;
    isLooping?: boolean;
}
export interface ISound extends IIngredient {
    key?: string;
    label?: string;
    description?: string;
    isActive?: boolean;
}
export type IngredientModelMap = {
    avatars: IAvatar;
    videos: IVideo;
    images: IImage;
    gifs: IGIF;
    voices: IVoice;
    musics: IMusic;
    ingredients: IIngredient;
};
export type IngredientInstanceMap = {
    avatars: IAvatar;
    videos: IVideo;
    images: IImage;
    gifs: IGIF;
    voices: IVoice;
    musics: IMusic;
    ingredients: IIngredient;
};
export interface IBulkDeleteResult {
    deleted: string[];
    failed: string[];
    message: string;
}
export interface IBulkDeleteRequest {
    type: string;
    ids: string[];
}
//# sourceMappingURL=ingredient.interface.d.ts.map