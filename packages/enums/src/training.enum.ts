export enum TrainingCategory {
  SUBJECT = 'subject',
  STYLE = 'style',
}

export enum TrainingStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum TrainingProvider {
  REPLICATE = 'replicate',
  GENFEED_AI = 'genfeed-ai',
}

export enum TrainingStage {
  QUEUED = 'queued',
  PREPROCESSING = 'preprocessing',
  TRAINING = 'training',
  POSTPROCESSING = 'postprocessing',
  UPLOADING = 'uploading',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
