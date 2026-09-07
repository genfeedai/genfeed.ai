export type ExtendedOrganizationSettings = {
  defaultModel?: string;
  defaultModelReview?: string;
  defaultModelUpdate?: string;
  defaultImageModel?: string;
  defaultImageToVideoModel?: string;
  defaultMusicModel?: string;
  defaultVideoModel?: string;
  enabledModelIds?: string[];
};

export type GenerationDefaultsState = {
  defaultModel: string;
  defaultModelReview: string;
  defaultModelUpdate: string;
  defaultImageModel: string;
  defaultImageToVideoModel: string;
  defaultMusicModel: string;
  defaultVideoModel: string;
};
