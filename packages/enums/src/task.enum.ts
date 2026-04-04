export enum TaskStatus {
  COMPLETED = 'completed',
  FAILED = 'failed',
  PENDING = 'pending',
  PROCESSING = 'processing',
}

export enum TaskCategory {
  GENERATION = 'generation',
  EDITING = 'editing',
  VALIDATION = 'validation',
}

export enum TaskType {
  GENERATE_IMAGE = 'generate-image',
  GENERATE_VIDEO = 'generate-video',
  GENERATE_MUSIC = 'generate-music',
  GENERATE_ARTICLE = 'generate-article',
  TRANSFORM = 'transform',
  UPSCALE = 'upscale',
  RESIZE = 'resize',
  CAPTION = 'caption',
  CLIP = 'clip',
  PUBLISH = 'publish',
}
