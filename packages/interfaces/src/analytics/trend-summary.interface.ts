/**
 * Trend summary interfaces
 * Used by cron trend summary notifications service
 */

import type {
  ITrendHashtag,
  ITrendSound,
  ITrendVideo,
} from './trend.interface';

export interface ITrendSummary {
  videos: ITrendVideo[];
  hashtags: ITrendHashtag[];
  sounds: ITrendSound[];
  generatedAt: Date;
}
