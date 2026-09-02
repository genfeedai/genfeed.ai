/**
 * Keyword Trigger Node Types
 *
 * This node starts a workflow when a keyword or phrase is detected
 * in incoming social posts. Supports exact match, contains, and regex modes.
 */

import type { BaseNodeData } from '../types';

export type KeywordTriggerPlatform = 'twitter' | 'instagram' | 'threads';

export type KeywordMatchMode = 'exact' | 'contains' | 'regex';

export interface KeywordTriggerNodeData extends BaseNodeData {
  type: 'keywordTrigger';

  /** Platform to monitor */
  platform: KeywordTriggerPlatform;
  /** Keywords or phrases to match */
  keywords: string[];
  /** Keywords to exclude from matching */
  excludeKeywords: string[];
  /** How to match keywords */
  matchMode: KeywordMatchMode;
  /** Whether matching should be case sensitive */
  caseSensitive: boolean;

  /** Last matched post ID (for deduplication) */
  lastPostId: string | null;
  /** Last triggered timestamp (for display) */
  lastTriggeredAt: string | null;
  /** Last matched keyword (for display) */
  lastMatchedKeyword: string | null;
}

export const DEFAULT_KEYWORD_TRIGGER_DATA: Partial<KeywordTriggerNodeData> = {
  caseSensitive: false,
  excludeKeywords: [],
  keywords: [],
  label: 'Keyword Trigger',
  lastMatchedKeyword: null,
  lastPostId: null,
  lastTriggeredAt: null,
  matchMode: 'contains',
  platform: 'twitter',
  status: 'idle',
  type: 'keywordTrigger',
};
