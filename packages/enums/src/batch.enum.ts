export enum BatchStatus {
  PENDING = 'pending',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum BatchItemStatus {
  PENDING = 'pending',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum ContentFormat {
  IMAGE = 'image',
  VIDEO = 'video',
  CAROUSEL = 'carousel',
  REEL = 'reel',
  STORY = 'story',
}

export enum ReferenceImageCategory {
  FACE = 'face',
  PRODUCT = 'product',
  STYLE = 'style',
  LOGO = 'logo',
}
