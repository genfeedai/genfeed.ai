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
    body: { type: 'string' },
    kind: {
      enum: ['comment', 'thread', 'signature'],
      type: 'string',
    },
    order: { minimum: 0, type: 'number' },
    platform: { type: 'string' },
  },
  required: ['body', 'kind'],
  type: 'object',
};

const mediaSchema = {
  properties: {
    assetId: { type: 'string' },
    kind: { type: 'string' },
    order: { minimum: 0, type: 'number' },
  },
  required: ['assetId'],
  type: 'object',
};

const recurrenceSchema = {
  properties: {
    endDate: { description: 'ISO 8601', type: 'string' },
    frequency: {
      enum: ['daily', 'weekly', 'monthly', 'yearly', 'never'],
      type: 'string',
    },
    interval: { minimum: 1, type: 'number' },
    maxRepeats: { minimum: 0, type: 'number' },
    weekdays: {
      description: 'Weekdays',
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
    credentialId: { type: 'string' },
    order: { minimum: 0, type: 'number' },
    platform: {
      enum: credentialPlatforms,
      type: 'string',
    },
    scheduledDate: { description: 'ISO 8601', type: 'string' },
    settings: { type: 'object' },
    timezone: { description: 'IANA', type: 'string' },
  },
  required: ['credentialId', 'platform'],
  type: 'object',
};

const releaseCreateProperties = {
  attachments: { items: attachmentSchema, type: 'array' },
  baseContent: { type: 'string' },
  brandId: { type: 'string' },
  media: { items: mediaSchema, type: 'array' },
  recurrence: recurrenceSchema,
  scheduledDate: { description: 'ISO 8601, with offset', type: 'string' },
  status: {
    enum: ['draft', 'scheduled'],
    type: 'string',
  },
  targets: {
    items: targetSchema,
    minItems: 1,
    type: 'array',
  },
  timezone: { description: 'IANA', type: 'string' },
  title: { type: 'string' },
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
    description: 'Create a multi-channel scheduled release.',
    name: 'create_scheduled_release',
    parameters: {
      properties: {
        idempotencyKey: { type: 'string' },
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
      'Get one scheduled release by ID: channel targets, validation/execution state, attachments, recurrence, and transition history.',
    name: 'get_scheduled_release',
    parameters: {
      properties: {
        releaseId: { type: 'string' },
      },
      required: ['releaseId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'Update a release or a target.',
    name: 'update_scheduled_release',
    parameters: {
      properties: {
        changes: {
          properties: updateProperties,
          type: 'object',
        },
        releaseId: { type: 'string' },
        scope: {
          enum: ['release', 'target'],
          type: 'string',
        },
        targetId: {
          description: 'Required if scope=target',
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
      'Control a scheduled release lifecycle: cancel, pause, resume, or publish now.',
    name: 'control_scheduled_release',
    parameters: {
      properties: {
        action: {
          enum: ['cancel', 'pause', 'resume', 'publish-now'],
          type: 'string',
        },
        releaseId: { type: 'string' },
      },
      required: ['releaseId', 'action'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List a brand connected publishing channels with credential ID, schedulability, health, and diagnostics. Read-only; check before scheduling.',
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
      'List scheduler channel capabilities: platforms, caption limits, media rules, publish modes, required settings. Read-only.',
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
      'Get one scheduler channel capability by platform: caption limits, media rules, publish modes, required settings, status. Read-only.',
    name: 'get_scheduler_capability',
    parameters: {
      properties: {
        platform: {
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
      'Validate a proposed target against the channel-capability contract; returns errors/warnings/validationState. Read-only.',
    name: 'validate_scheduler_target',
    parameters: {
      properties: {
        caption: {
          description: 'Caption or shared base content to validate',
          type: 'string',
        },
        credentialId: { type: 'string' },
        media: {
          description: 'Media items for this target',
          items: {
            properties: {
              id: { type: 'string' },
              isAnimated: {
                description: 'Whether the source media is animated (GIF)',
                type: 'boolean',
              },
              kind: {
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
          enum: credentialPlatforms,
          type: 'string',
        },
        publishMode: {
          enum: ['draft', 'publish_now', 'scheduled'],
          type: 'string',
        },
        settings: {
          description: 'Publishing settings',
          type: 'object',
        },
        visibility: {
          description: 'Audience visibility',
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
