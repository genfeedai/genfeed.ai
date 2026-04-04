export enum EditorProjectStatus {
  DRAFT = 'draft',
  RENDERING = 'rendering',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum EditorTrackType {
  VIDEO = 'video',
  AUDIO = 'audio',
  TEXT = 'text',
}

export enum EditorTransitionType {
  NONE = 'none',
  FADE = 'fade',
  DISSOLVE = 'dissolve',
  WIPE = 'wipe',
  SLIDE = 'slide',
}

export enum EditorEffectType {
  NONE = 'none',
  BLUR = 'blur',
  BRIGHTNESS = 'brightness',
  CONTRAST = 'contrast',
  SATURATION = 'saturation',
  GRAYSCALE = 'grayscale',
  SEPIA = 'sepia',
}
