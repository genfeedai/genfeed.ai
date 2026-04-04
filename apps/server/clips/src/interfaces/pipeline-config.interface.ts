export interface IPipelineConfig {
  minClipDuration: number;
  maxClipDuration: number;
  maxClips: number;
  aspectRatio: string;
  captionStyle: string;
  addCaptions: boolean;
  llmModel: string;
}

export const DEFAULT_PIPELINE_CONFIG: IPipelineConfig = {
  addCaptions: true,
  aspectRatio: '9:16',
  captionStyle: 'default',
  llmModel: 'deepseek/deepseek-chat',
  maxClipDuration: 90,
  maxClips: 10,
  minClipDuration: 15,
};
