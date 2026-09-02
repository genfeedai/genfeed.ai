/**
 * Beat-Synced Video Editor Enums
 *
 * Enums for the beat-synced video editing workflow nodes.
 */

/**
 * Cut strategies for beat-synced video editing
 */
export enum BeatSyncCutStrategy {
  EVERY_BEAT = 'everyBeat',
  EVERY_OTHER_BEAT = 'everyOtherBeat',
  DOWNBEATS_ONLY = 'downbeatsOnly',
  CUSTOM = 'custom',
}

/**
 * Transition types between video clips
 */
export enum BeatSyncTransitionType {
  CUT = 'cut',
  CROSSFADE = 'crossfade',
  FLASH = 'flash',
  ZOOM = 'zoom',
}

/**
 * Music source types for beat-synced editing
 */
export enum MusicSourceType {
  TREND_SOUND = 'trendSound',
  LIBRARY = 'library',
  UPLOAD = 'upload',
  GENERATE = 'generate',
}

/**
 * Beat detection sensitivity levels
 */
export enum BeatSensitivity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}
