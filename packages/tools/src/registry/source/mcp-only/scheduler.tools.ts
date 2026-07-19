import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

const credentialPlatforms = [
  'youtube',
  'instagram',
  'tiktok',
  'facebook',
  'google_ads',
  'google_search_console',
  'twitter',
  'linkedin',
  'pinterest',
  'reddit',
  'discord',
  'telegram',
  'twitch',
  'medium',
  'threads',
  'fanvue',
  'slack',
  'wordpress',
  'snapchat',
  'whatsapp',
  'mastodon',
  'ghost',
  'shopify',
  'beehiiv',
  'unipile',
  'devto',
  'product_hunt',
  'hacker_news',
];

const attachmentSchema = {
  properties: {
    body: { description: 'Attachment content', type: 'string' },
    kind: {
      description: 'Supplemental content kind',
      enum: ['comment', 'thread', 'signature'],
      type: 'string',
    },
    order: { minimum: 0, type: 'number' },
    platform: { description: 'Optional platform scope', type: 'string' },
  },
  required: ['body', 'kind'],
  type: 'object',
};

const mediaSchema = {
  properties: {
    assetId: { description: 'Media asset ID', type: 'string' },
    kind: { description: 'Optional media kind', type: 'string' },
    order: { minimum: 0, type: 'number' },
  },
  required: ['assetId'],
  type: 'object',
};

const recurrenceSchema = {
  properties: {
    endDate: {
      description: 'ISO 8601 recurrence end date',
      type: 'string',
    },
    frequency: {
      enum: ['daily', 'weekly', 'monthly', 'yearly', 'never'],
      type: 'string',
    },
    interval: { minimum: 1, type: 'number' },
    maxRepeats: { minimum: 0, type: 'number' },
    weekdays: {
      description: 'Weekday numbers used by weekly recurrence',
      items: { type: 'number' },
      type: 'array',
    },
  },
  required: ['frequency', 'interval'],
  type: 'object',
};

const targetSchema = {
  properties: {
    attachments: { items: attachmentSchema, type: 'array' },
    credentialId: {
      description: 'Connected credential ID for this destination',
      type: 'string',
    },
    order: { minimum: 0, type: 'number' },
    platform: {
      description:
        'Credential platform (for example linkedin, instagram, or youtube)',
      enum: credentialPlatforms,
      type: 'string',
    },
    scheduledDate: {
      description: 'Optional target-specific ISO 8601 scheduled date',
      type: 'string',
    },
    settings: {
      description: 'Platform-specific publishing settings',
      type: 'object',
    },
    timezone: {
      description: 'Optional target-specific IANA timezone',
      type: 'string',
    },
  },
  required: ['credentialId', 'platform'],
  type: 'object',
};

const releaseCreateProperties = {
  attachments: { items: attachmentSchema, type: 'array' },
  baseContent: {
    description: 'Shared content published to every target',
    type: 'string',
  },
  brandId: { description: 'Optional brand ID', type: 'string' },
  media: { items: mediaSchema, type: 'array' },
  recurrence: recurrenceSchema,
  scheduledDate: {
    description: 'ISO 8601 scheduled date with timezone offset',
    type: 'string',
  },
  status: {
    description: 'Create as a draft or immediately schedule it',
    enum: ['draft', 'scheduled'],
    type: 'string',
  },
  targets: {
    description: 'One or more channel destinations',
    items: targetSchema,
    minItems: 1,
    type: 'array',
  },
  timezone: { description: 'IANA timezone', type: 'string' },
  title: { description: 'Release title', type: 'string' },
};

const updateProperties = {
  attachments: { items: attachmentSchema, type: 'array' },
  baseContent: { type: 'string' },
  brandId: { type: 'string' },
  error: {
    description: 'Target publishing failure detail; target scope only',
    type: ['object', 'null'],
  },
  executionState: {
    description: 'Target execution state; target scope only',
    enum: [
      'draft',
      'scheduled',
      'paused',
      'cancelled',
      'publishing',
      'published',
      'failed',
      'skipped',
    ],
    type: 'string',
  },
  externalProviderId: { type: ['string', 'null'] },
  externalShortcode: { type: ['string', 'null'] },
  idempotencyKey: { type: 'string' },
  lastAttemptAt: { type: 'string' },
  media: { items: mediaSchema, type: 'array' },
  order: { minimum: 0, type: 'number' },
  publishedAt: { type: 'string' },
  readiness: { type: ['object', 'null'] },
  recurrence: { ...recurrenceSchema, type: ['object', 'null'] },
  retryCount: { minimum: 0, type: 'number' },
  scheduledDate: { type: 'string' },
  settings: { type: 'object' },
  status: {
    enum: [
      'draft',
      'scheduled',
      'paused',
      'cancelled',
      'publishing',
      'published',
      'failed',
      'partially-published',
    ],
    type: 'string',
  },
  timezone: { type: 'string' },
  title: { type: 'string' },
  url: { type: ['string', 'null'] },
  validationIssues: { items: { type: 'string' }, type: 'array' },
  validationState: {
    enum: ['pending', 'valid', 'warning', 'invalid'],
    type: 'string',
  },
};

/** Thin MCP access to the canonical `/post-groups` scheduler lifecycle. */
export const MCP_SCHEDULER_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Create a multi-channel scheduled release through the canonical scheduler API. This is a mutating action and requires approval. Provide an idempotency key when retrying a request.',
    name: 'create_scheduled_release',
    parameters: {
      properties: {
        idempotencyKey: {
          description: 'Optional idempotency key for safe retries',
          type: 'string',
        },
        release: {
          properties: releaseCreateProperties,
          required: ['title', 'baseContent', 'timezone', 'targets'],
          type: 'object',
        },
      },
      required: ['release'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Get one scheduled release by ID, including its channel targets, validation and execution states, attachments, recurrence, and transition history.',
    name: 'get_scheduled_release',
    parameters: {
      properties: {
        releaseId: { description: 'Scheduled release ID', type: 'string' },
      },
      required: ['releaseId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Update either a scheduled release or one of its channel targets through the canonical scheduler API. Set scope explicitly; target scope also requires targetId. This mutating action requires approval.',
    name: 'update_scheduled_release',
    parameters: {
      properties: {
        changes: {
          description:
            'Fields to update. Release and target fields share this bounded schema; the API validates the selected scope.',
          properties: updateProperties,
          type: 'object',
        },
        releaseId: { description: 'Scheduled release ID', type: 'string' },
        scope: {
          description: 'Whether changes apply to the release or one target',
          enum: ['release', 'target'],
          type: 'string',
        },
        targetId: {
          description: 'Required only when scope is target',
          type: 'string',
        },
      },
      required: ['releaseId', 'scope', 'changes'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Control a scheduled release lifecycle: cancel, pause, resume, or publish immediately. The API enforces valid state transitions. This mutating action requires approval.',
    name: 'control_scheduled_release',
    parameters: {
      properties: {
        action: {
          enum: ['cancel', 'pause', 'resume', 'publish-now'],
          type: 'string',
        },
        releaseId: { description: 'Scheduled release ID', type: 'string' },
      },
      required: ['releaseId', 'action'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
