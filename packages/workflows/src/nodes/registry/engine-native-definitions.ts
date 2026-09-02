import {
  DEFAULT_COMMENT_TRIGGER_DATA,
  DEFAULT_ENGAGEMENT_TRIGGER_DATA,
  DEFAULT_GENFEED_ACTION_DATA,
  DEFAULT_KEYWORD_TRIGGER_DATA,
} from '../definitions';
import type { CatalogNodeDefinition } from './catalog-node-definition';

/**
 * Hand-authored engine-native node definitions. Product operations come from
 * the action catalog (`action-node-definitions.ts`); do not add product nodes
 * here.
 */
export const ENGINE_NATIVE_NODE_DEFINITIONS: Record<
  string,
  CatalogNodeDefinition
> = {
  commentTrigger: {
    category: 'automation',
    defaultData: DEFAULT_COMMENT_TRIGGER_DATA as Record<string, unknown>,
    description: 'Start workflow when a social comment is detected',
    icon: 'MessageCircle',
    inputs: [],
    label: 'Comment Trigger',
    outputs: [
      { id: 'commentId', label: 'Comment ID', type: 'text' },
      { id: 'contentId', label: 'Content ID', type: 'text' },
      { id: 'contentUrl', label: 'Content URL', type: 'text' },
      { id: 'text', label: 'Comment Text', type: 'text' },
      { id: 'authorId', label: 'Author ID', type: 'text' },
      { id: 'authorUsername', label: 'Author Username', type: 'text' },
      { id: 'platform', label: 'Platform', type: 'text' },
    ],
    type: 'commentTrigger',
  },
  engagementTrigger: {
    category: 'automation',
    defaultData: DEFAULT_ENGAGEMENT_TRIGGER_DATA as Record<string, unknown>,
    description:
      'Start workflow when engagement metrics (likes, comments, shares, views) hit a threshold',
    icon: 'ChartNoAxesColumn',
    inputs: [],
    label: 'Engagement Trigger',
    outputs: [
      { id: 'postId', label: 'Post ID', type: 'text' },
      { id: 'postUrl', label: 'Post URL', type: 'text' },
      { id: 'metricType', label: 'Metric Type', type: 'text' },
      { id: 'currentValue', label: 'Current Value', type: 'number' },
      { id: 'threshold', label: 'Threshold', type: 'number' },
      { id: 'platform', label: 'Platform', type: 'text' },
    ],
    type: 'engagementTrigger',
  },
  genfeedAction: {
    category: 'automation',
    defaultData: DEFAULT_GENFEED_ACTION_DATA as Record<string, unknown>,
    description:
      'Execute one registered Genfeed action inside the workflow engine',
    icon: 'Workflow',
    inputs: [{ id: 'input', label: 'Action Input', type: 'any' }],
    label: 'Genfeed Action',
    outputs: [{ id: 'output', label: 'Action Output', type: 'any' }],
    type: 'genfeedAction',
  },
  keywordTrigger: {
    category: 'automation',
    defaultData: DEFAULT_KEYWORD_TRIGGER_DATA as Record<string, unknown>,
    description:
      'Start workflow when a keyword or phrase is detected in social posts',
    icon: 'Search',
    inputs: [],
    label: 'Keyword Trigger',
    outputs: [
      { id: 'postId', label: 'Post ID', type: 'text' },
      { id: 'postUrl', label: 'Post URL', type: 'text' },
      { id: 'text', label: 'Post Text', type: 'text' },
      { id: 'matchedKeyword', label: 'Matched Keyword', type: 'text' },
      { id: 'authorId', label: 'Author ID', type: 'text' },
      { id: 'authorUsername', label: 'Author Username', type: 'text' },
      { id: 'platform', label: 'Platform', type: 'text' },
    ],
    type: 'keywordTrigger',
  },
};
