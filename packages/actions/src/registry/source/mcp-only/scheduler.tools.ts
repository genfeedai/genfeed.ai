import type { SourceTool } from '../../../interfaces/source-tool.interface';

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

const releaseUpdateProperties = {
  attachments: { items: attachmentSchema, type: 'array' },
  baseContent: { type: 'string' },
  media: { items: mediaSchema, type: 'array' },
  recurrence: { ...recurrenceSchema, type: ['object', 'null'] },
  scheduledDate: { type: 'string' },
  timezone: { type: 'string' },
  title: { type: 'string' },
};

const targetUpdateProperties = {
  order: { minimum: 0, type: 'number' },
  scheduledDate: { type: 'string' },
  settings: { type: 'object' },
  timezone: { type: 'string' },
};

const updateProperties = {
  ...releaseUpdateProperties,
  ...targetUpdateProperties,
};

/**
 * Thin MCP access to the canonical `/post-groups` scheduler lifecycle plus the
 * existing channel-capability and brand publishing-readiness routes.
 */
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
            'Editable release or target fields. Lifecycle and worker-owned execution fields are intentionally excluded; use control_scheduled_release for lifecycle changes.',
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
  {
    creditCost: 0,
    description:
      'List every connected publishing channel for a brand with its credential ID, provider, schedulability, health state, required action, and safe diagnostics. Read-only; use this before scheduling to avoid blocked or degraded targets.',
    name: 'list_brand_publishing_readiness',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID whose connected channels should be checked',
          type: 'string',
        },
      },
      required: ['brandId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List scheduler channel capabilities: supported platforms, caption limits, media rules, publish modes, required settings, and helper lookups. Read-only; does not mutate state. Use includeHidden or includePlanned to include channels that are not yet schedulable.',
    name: 'list_scheduler_capabilities',
    parameters: {
      properties: {
        includeHidden: {
          description:
            'Include hidden channels that exist but refuse scheduling',
          type: 'boolean',
        },
        includePlanned: {
          description: 'Include planned channels with no live publish path yet',
          type: 'boolean',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Get one scheduler channel capability by platform. Returns the canonical platform contract: caption limits, media rules, publish modes, required settings, helpers, and status. Read-only; does not mutate state.',
    name: 'get_scheduler_capability',
    parameters: {
      properties: {
        platform: {
          description:
            'Credential platform (for example linkedin, instagram, or youtube)',
          enum: credentialPlatforms,
          type: 'string',
        },
      },
      required: ['platform'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Validate a proposed scheduler target against the canonical channel-capability contract. Returns errors, warnings, and validationState without creating or updating a release. Read-only; does not mutate state.',
    name: 'validate_scheduler_target',
    parameters: {
      properties: {
        caption: {
          description: 'Caption or shared base content to validate',
          type: 'string',
        },
        credentialId: {
          description: 'Optional connected credential ID for this destination',
          type: 'string',
        },
        media: {
          description: 'Media items proposed for this target',
          items: {
            properties: {
              id: { description: 'Optional media asset ID', type: 'string' },
              isAnimated: {
                description:
                  'Whether the source media is animated (GIF and friends)',
                type: 'boolean',
              },
              kind: {
                description: 'Media kind',
                enum: ['image', 'video', 'short_video', 'carousel', 'link'],
                type: 'string',
              },
            },
            required: ['kind'],
            type: 'object',
          },
          type: 'array',
        },
        platform: {
          description:
            'Credential platform (for example linkedin, instagram, or youtube)',
          enum: credentialPlatforms,
          type: 'string',
        },
        publishMode: {
          description: 'How the target would be published',
          enum: ['draft', 'publish_now', 'scheduled'],
          type: 'string',
        },
        settings: {
          description: 'Platform-specific publishing settings',
          type: 'object',
        },
        visibility: {
          description: 'Audience visibility of the published target',
          enum: ['public', 'private', 'unlisted'],
          type: 'string',
        },
      },
      required: ['platform'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
