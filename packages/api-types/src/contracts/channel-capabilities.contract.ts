/**
 * Shared channel capability catalog for scheduler targets.
 *
 * This keeps platform-specific limits, required channel settings, and helper
 * lookup contracts in one request-side contract so composer UI, API validation,
 * workers, CLI, and MCP can present and enforce the same scheduler failures.
 * Foundation for epic #1123, issue #1125.
 */

import { CredentialPlatform, TargetValidationState } from '@genfeedai/enums';
import { z } from 'zod';

export const channelCapabilityStatusValues = [
  'supported',
  'hidden',
  'planned',
] as const;

export const channelMediaKindValues = [
  'image',
  'video',
  'short_video',
  'carousel',
  'link',
] as const;

export const channelPublishModeValues = [
  'draft',
  'publish_now',
  'scheduled',
] as const;

export const channelSettingFieldTypeValues = [
  'string',
  'text',
  'number',
  'boolean',
  'select',
  'multi_select',
  'url',
] as const;

export const channelHelperKindValues = [
  'credential',
  'account',
  'page',
  'board',
  'subreddit',
  'audio_style',
] as const;

export const channelValidationSeverityValues = ['error', 'warning'] as const;

export const channelCapabilityStatusSchema = z.enum(
  channelCapabilityStatusValues,
);
export const channelMediaKindSchema = z.enum(channelMediaKindValues);
export const channelPublishModeSchema = z.enum(channelPublishModeValues);
export const channelSettingFieldTypeSchema = z.enum(
  channelSettingFieldTypeValues,
);
export const channelHelperKindSchema = z.enum(channelHelperKindValues);
export const channelValidationSeveritySchema = z.enum(
  channelValidationSeverityValues,
);

const channelTargetSettingsSchema = z
  .record(z.string(), z.unknown())
  .default({});

const settingDefaultValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const channelSettingOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

export const channelSettingDefinitionSchema = z.object({
  defaultValue: settingDefaultValueSchema.optional(),
  description: z.string().min(1).optional(),
  helper: z.string().min(1).optional(),
  key: z.string().min(1),
  label: z.string().min(1),
  options: z.array(channelSettingOptionSchema).optional(),
  required: z.boolean().optional(),
  type: channelSettingFieldTypeSchema,
});

export const channelHelperDefinitionSchema = z.object({
  description: z.string().min(1).optional(),
  key: z.string().min(1),
  kind: channelHelperKindSchema,
  label: z.string().min(1),
  lookupPath: z.string().min(1).optional(),
  required: z.boolean().optional(),
});

export const channelCaptionCapabilitySchema = z.object({
  maxLength: z.number().int().positive(),
  required: z.boolean().optional(),
});

export const channelMediaCapabilitySchema = z.object({
  kinds: z.array(channelMediaKindSchema).min(1),
  maxItems: z.number().int().positive().optional(),
  minItems: z.number().int().min(0).optional(),
});

export const channelCapabilitySchema = z.object({
  caption: channelCaptionCapabilitySchema,
  description: z.string().min(1),
  helpers: z.array(channelHelperDefinitionSchema),
  label: z.string().min(1),
  media: channelMediaCapabilitySchema,
  platform: z.nativeEnum(CredentialPlatform),
  publishModes: z.array(channelPublishModeSchema).min(1),
  settings: z.array(channelSettingDefinitionSchema),
  status: channelCapabilityStatusSchema,
});

export const channelTargetValidationMediaSchema = z.object({
  id: z.string().min(1).optional(),
  kind: channelMediaKindSchema,
});

export const validateChannelTargetSettingsInputSchema = z.object({
  caption: z.string().optional(),
  media: z.array(channelTargetValidationMediaSchema).optional(),
  platform: z.union([z.nativeEnum(CredentialPlatform), z.string().min(1)]),
  publishMode: channelPublishModeSchema.optional(),
  settings: channelTargetSettingsSchema.optional(),
});

export const channelValidationIssueSchema = z.object({
  code: z.string().min(1),
  field: z.string().min(1).optional(),
  message: z.string().min(1),
  severity: channelValidationSeveritySchema,
});

export const channelTargetValidationResultSchema = z.object({
  capability: channelCapabilitySchema.optional(),
  errors: z.array(channelValidationIssueSchema),
  platform: z.union([z.nativeEnum(CredentialPlatform), z.string().min(1)]),
  valid: z.boolean(),
  validationState: z.nativeEnum(TargetValidationState),
  warnings: z.array(channelValidationIssueSchema),
});

export const channelCapabilityListOptionsSchema = z.object({
  includeHidden: z.boolean().optional(),
  includePlanned: z.boolean().optional(),
});

export type ChannelCapabilityStatus = z.infer<
  typeof channelCapabilityStatusSchema
>;
export type ChannelMediaKind = z.infer<typeof channelMediaKindSchema>;
export type ChannelPublishMode = z.infer<typeof channelPublishModeSchema>;
export type ChannelSettingFieldType = z.infer<
  typeof channelSettingFieldTypeSchema
>;
export type ChannelSettingDefinition = z.infer<
  typeof channelSettingDefinitionSchema
>;
export type ChannelHelperDefinition = z.infer<
  typeof channelHelperDefinitionSchema
>;
export type ChannelCapability = z.infer<typeof channelCapabilitySchema>;
export type ValidateChannelTargetSettingsInput = z.infer<
  typeof validateChannelTargetSettingsInputSchema
>;
export type ChannelValidationIssue = z.infer<
  typeof channelValidationIssueSchema
>;
export type ChannelTargetValidationResult = z.infer<
  typeof channelTargetValidationResultSchema
>;
export type ChannelCapabilityListOptions = z.infer<
  typeof channelCapabilityListOptionsSchema
>;

export const PRODUCTIZED_SCHEDULER_PLATFORMS = [
  CredentialPlatform.YOUTUBE,
  CredentialPlatform.TIKTOK,
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.TWITTER,
  CredentialPlatform.LINKEDIN,
] as const;

export type ProductizedSchedulerPlatform =
  (typeof PRODUCTIZED_SCHEDULER_PLATFORMS)[number];

const channelCapabilities = [
  {
    caption: { maxLength: 5_000, required: false },
    description:
      'Long-form or Shorts video publishing with explicit visibility settings.',
    helpers: [
      {
        key: 'youtube.credential',
        kind: 'credential',
        label: 'YouTube credential',
        required: true,
      },
      {
        key: 'youtube.channels',
        kind: 'account',
        label: 'YouTube channel',
        lookupPath: '/integrations/youtube/channels',
        required: true,
      },
    ],
    label: 'YouTube',
    media: { kinds: ['video', 'short_video'], maxItems: 1, minItems: 1 },
    platform: CredentialPlatform.YOUTUBE,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [
      {
        defaultValue: 'private',
        helper: 'youtube.channels',
        key: 'privacyStatus',
        label: 'Privacy',
        options: [
          { label: 'Public', value: 'public' },
          { label: 'Unlisted', value: 'unlisted' },
          { label: 'Private', value: 'private' },
        ],
        required: true,
        type: 'select',
      },
      {
        defaultValue: false,
        key: 'madeForKids',
        label: 'Made for kids',
        type: 'boolean',
      },
      {
        key: 'playlistId',
        label: 'Playlist',
        type: 'string',
      },
    ],
    status: 'supported',
  },
  {
    caption: { maxLength: 2_200, required: false },
    description:
      'Short-form vertical video publishing with privacy and interaction controls.',
    helpers: [
      {
        key: 'tiktok.credential',
        kind: 'credential',
        label: 'TikTok credential',
        required: true,
      },
      {
        key: 'tiktok.accounts',
        kind: 'account',
        label: 'TikTok account',
        lookupPath: '/integrations/tiktok/accounts',
        required: true,
      },
      {
        key: 'tiktok.audio_styles',
        kind: 'audio_style',
        label: 'TikTok audio style',
      },
    ],
    label: 'TikTok',
    media: { kinds: ['short_video', 'video'], maxItems: 1, minItems: 1 },
    platform: CredentialPlatform.TIKTOK,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [
      {
        defaultValue: 'public',
        helper: 'tiktok.accounts',
        key: 'privacyLevel',
        label: 'Privacy',
        options: [
          { label: 'Public', value: 'public' },
          { label: 'Friends', value: 'friends' },
          { label: 'Private', value: 'private' },
        ],
        required: true,
        type: 'select',
      },
      {
        defaultValue: true,
        key: 'allowComments',
        label: 'Allow comments',
        type: 'boolean',
      },
      {
        defaultValue: true,
        key: 'allowDuet',
        label: 'Allow duet',
        type: 'boolean',
      },
      {
        defaultValue: true,
        key: 'allowStitch',
        label: 'Allow stitch',
        type: 'boolean',
      },
    ],
    status: 'supported',
  },
  {
    caption: { maxLength: 2_200, required: false },
    description:
      'Feed, Reel, Story, or carousel publishing for professional Instagram accounts.',
    helpers: [
      {
        key: 'instagram.credential',
        kind: 'credential',
        label: 'Instagram credential',
        required: true,
      },
      {
        key: 'instagram.accounts',
        kind: 'account',
        label: 'Instagram professional account',
        lookupPath: '/integrations/instagram/accounts',
        required: true,
      },
    ],
    label: 'Instagram',
    media: {
      kinds: ['image', 'video', 'short_video', 'carousel'],
      maxItems: 10,
      minItems: 1,
    },
    platform: CredentialPlatform.INSTAGRAM,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [
      {
        defaultValue: 'feed',
        helper: 'instagram.accounts',
        key: 'placement',
        label: 'Placement',
        options: [
          { label: 'Feed', value: 'feed' },
          { label: 'Reel', value: 'reel' },
          { label: 'Story', value: 'story' },
        ],
        required: true,
        type: 'select',
      },
    ],
    status: 'supported',
  },
  {
    caption: { maxLength: 280, required: true },
    description:
      'Text, media, and link posts for X with a bounded attachment count.',
    helpers: [
      {
        key: 'twitter.credential',
        kind: 'credential',
        label: 'X credential',
        required: true,
      },
      {
        key: 'twitter.accounts',
        kind: 'account',
        label: 'X account',
        lookupPath: '/integrations/twitter/accounts',
        required: true,
      },
    ],
    label: 'X (Twitter)',
    media: { kinds: ['image', 'video', 'link'], maxItems: 4, minItems: 0 },
    platform: CredentialPlatform.TWITTER,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [
      {
        defaultValue: 'everyone',
        key: 'replyPolicy',
        label: 'Who can reply',
        options: [
          { label: 'Everyone', value: 'everyone' },
          { label: 'Mentioned accounts', value: 'mentioned' },
          { label: 'Following', value: 'following' },
        ],
        type: 'select',
      },
    ],
    status: 'supported',
  },
  {
    caption: { maxLength: 3_000, required: true },
    description:
      'Text, media, or link publishing to an organization or member LinkedIn feed.',
    helpers: [
      {
        key: 'linkedin.credential',
        kind: 'credential',
        label: 'LinkedIn credential',
        required: true,
      },
      {
        key: 'linkedin.accounts',
        kind: 'account',
        label: 'LinkedIn profile or organization',
        lookupPath: '/integrations/linkedin/accounts',
        required: true,
      },
    ],
    label: 'LinkedIn',
    media: { kinds: ['image', 'video', 'link'], maxItems: 1, minItems: 0 },
    platform: CredentialPlatform.LINKEDIN,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [
      {
        defaultValue: 'PUBLIC',
        key: 'visibility',
        label: 'Visibility',
        options: [
          { label: 'Public', value: 'PUBLIC' },
          { label: 'Connections', value: 'CONNECTIONS' },
        ],
        type: 'select',
      },
    ],
    status: 'supported',
  },
  {
    caption: { maxLength: 63_206, required: false },
    description:
      'Backend integration stub for Facebook pages; hidden until scheduler publishing is productized.',
    helpers: [
      {
        key: 'facebook.pages',
        kind: 'page',
        label: 'Facebook page',
        lookupPath: '/integrations/facebook/pages',
        required: true,
      },
    ],
    label: 'Facebook',
    media: { kinds: ['image', 'video', 'link'], maxItems: 10, minItems: 0 },
    platform: CredentialPlatform.FACEBOOK,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [],
    status: 'hidden',
  },
  {
    caption: { maxLength: 500, required: false },
    description:
      'Backend integration stub for Pinterest boards; hidden until scheduler publishing is productized.',
    helpers: [
      {
        key: 'pinterest.boards',
        kind: 'board',
        label: 'Pinterest board',
        lookupPath: '/integrations/pinterest/boards',
        required: true,
      },
    ],
    label: 'Pinterest',
    media: { kinds: ['image', 'video'], maxItems: 1, minItems: 1 },
    platform: CredentialPlatform.PINTEREST,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [],
    status: 'hidden',
  },
  {
    caption: { maxLength: 40_000, required: false },
    description:
      'Backend integration stub for subreddit posts; hidden until scheduler publishing is productized.',
    helpers: [
      {
        key: 'reddit.subreddits',
        kind: 'subreddit',
        label: 'Subreddit',
        lookupPath: '/integrations/reddit/subreddits',
        required: true,
      },
    ],
    label: 'Reddit',
    media: { kinds: ['image', 'video', 'link'], maxItems: 1, minItems: 0 },
    platform: CredentialPlatform.REDDIT,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [],
    status: 'hidden',
  },
  {
    caption: { maxLength: 500, required: true },
    description:
      'Planned scheduler surface for Threads once publishing support is exposed.',
    helpers: [
      {
        key: 'threads.accounts',
        kind: 'account',
        label: 'Threads account',
        required: true,
      },
    ],
    label: 'Threads',
    media: { kinds: ['image', 'video', 'link'], maxItems: 10, minItems: 0 },
    platform: CredentialPlatform.THREADS,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [],
    status: 'planned',
  },
  {
    caption: { maxLength: 100_000, required: true },
    description: 'Planned scheduler surface for Medium article publishing.',
    helpers: [
      {
        key: 'medium.accounts',
        kind: 'account',
        label: 'Medium account',
        required: true,
      },
    ],
    label: 'Medium',
    media: { kinds: ['image', 'link'], maxItems: 10, minItems: 0 },
    platform: CredentialPlatform.MEDIUM,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [],
    status: 'planned',
  },
] satisfies ChannelCapability[];

export const CHANNEL_CAPABILITIES: readonly ChannelCapability[] =
  channelCapabilities.map((capability) =>
    channelCapabilitySchema.parse(capability),
  );

const channelCapabilitiesByPlatform = new Map<
  CredentialPlatform,
  ChannelCapability
>(CHANNEL_CAPABILITIES.map((capability) => [capability.platform, capability]));

export function listChannelCapabilities(
  options: ChannelCapabilityListOptions = {},
): ChannelCapability[] {
  return CHANNEL_CAPABILITIES.filter((capability) => {
    if (capability.status === 'supported') {
      return true;
    }

    if (capability.status === 'hidden') {
      return options.includeHidden === true;
    }

    return options.includePlanned === true;
  }).map(cloneChannelCapability);
}

export function getChannelCapability(
  platform: CredentialPlatform | string,
): ChannelCapability | undefined {
  const normalizedPlatform = normalizeCredentialPlatform(platform);
  if (!normalizedPlatform) {
    return undefined;
  }

  const capability = channelCapabilitiesByPlatform.get(normalizedPlatform);
  return capability ? cloneChannelCapability(capability) : undefined;
}

export function validateChannelTargetSettings(
  input: ValidateChannelTargetSettingsInput,
): ChannelTargetValidationResult {
  const parsedInput = validateChannelTargetSettingsInputSchema.safeParse(input);
  const platform = extractInputPlatform(input);

  if (!parsedInput.success) {
    return invalidResult(
      platform,
      parsedInput.error.issues.map((issue) => ({
        code: 'channel_target.invalid_payload',
        field: issue.path.join('.') || undefined,
        message: issue.message,
        severity: 'error',
      })),
    );
  }

  const normalizedPlatform = normalizeCredentialPlatform(
    parsedInput.data.platform,
  );

  if (!normalizedPlatform) {
    return invalidResult(String(parsedInput.data.platform), [
      {
        code: 'channel_target.unsupported_platform',
        field: 'platform',
        message: `Platform "${parsedInput.data.platform}" is not supported by scheduler channel validation.`,
        severity: 'error',
      },
    ]);
  }

  const capability = channelCapabilitiesByPlatform.get(normalizedPlatform);

  if (!capability) {
    return invalidResult(normalizedPlatform, [
      {
        code: 'channel_target.missing_capability',
        field: 'platform',
        message: `No scheduler channel capability is registered for ${normalizedPlatform}.`,
        severity: 'error',
      },
    ]);
  }

  const errors: ChannelValidationIssue[] = [];
  const warnings: ChannelValidationIssue[] = [];

  if (capability.status === 'hidden') {
    errors.push({
      code: 'channel_target.hidden_channel',
      field: 'platform',
      message: `${capability.label} is hidden from scheduler publishing.`,
      severity: 'error',
    });
  }

  if (capability.status === 'planned') {
    errors.push({
      code: 'channel_target.planned_channel',
      field: 'platform',
      message: `${capability.label} is planned but not yet enabled for scheduler publishing.`,
      severity: 'error',
    });
  }

  errors.push(...validateCaption(parsedInput.data, capability));
  errors.push(...validateMedia(parsedInput.data, capability));
  errors.push(...validatePublishMode(parsedInput.data, capability));
  errors.push(...validateSettings(parsedInput.data, capability));

  return {
    capability: cloneChannelCapability(capability),
    errors,
    platform: normalizedPlatform,
    valid: errors.length === 0,
    validationState:
      errors.length === 0
        ? TargetValidationState.VALID
        : TargetValidationState.INVALID,
    warnings,
  };
}

function cloneChannelCapability(
  capability: ChannelCapability,
): ChannelCapability {
  return {
    ...capability,
    caption: { ...capability.caption },
    helpers: capability.helpers.map((helper) => ({ ...helper })),
    media: {
      ...capability.media,
      kinds: [...capability.media.kinds],
    },
    publishModes: [...capability.publishModes],
    settings: capability.settings.map((setting) => ({
      ...setting,
      options: setting.options?.map((option) => ({ ...option })),
    })),
  };
}

function normalizeCredentialPlatform(
  platform: CredentialPlatform | string,
): CredentialPlatform | undefined {
  const parsed = z.nativeEnum(CredentialPlatform).safeParse(platform);
  return parsed.success ? parsed.data : undefined;
}

function extractInputPlatform(input: unknown): CredentialPlatform | string {
  if (!input || typeof input !== 'object' || !('platform' in input)) {
    return 'unknown';
  }

  const platform = (input as { platform?: unknown }).platform;
  return typeof platform === 'string' ? platform : 'unknown';
}

function invalidResult(
  platform: CredentialPlatform | string,
  errors: ChannelValidationIssue[],
): ChannelTargetValidationResult {
  return {
    errors,
    platform,
    valid: false,
    validationState: TargetValidationState.INVALID,
    warnings: [],
  };
}

function validateCaption(
  input: ValidateChannelTargetSettingsInput,
  capability: ChannelCapability,
): ChannelValidationIssue[] {
  const caption = input.caption ?? '';
  const captionLength = Array.from(caption).length;
  const errors: ChannelValidationIssue[] = [];

  if (capability.caption.required && caption.trim().length === 0) {
    errors.push({
      code: 'channel_target.caption_required',
      field: 'caption',
      message: `${capability.label} requires caption text.`,
      severity: 'error',
    });
  }

  if (captionLength > capability.caption.maxLength) {
    errors.push({
      code: 'channel_target.caption_too_long',
      field: 'caption',
      message: `${capability.label} captions must be ${capability.caption.maxLength} characters or fewer.`,
      severity: 'error',
    });
  }

  return errors;
}

function validateMedia(
  input: ValidateChannelTargetSettingsInput,
  capability: ChannelCapability,
): ChannelValidationIssue[] {
  const media = input.media ?? [];
  const errors: ChannelValidationIssue[] = [];

  if (
    typeof capability.media.minItems === 'number' &&
    media.length < capability.media.minItems
  ) {
    errors.push({
      code: 'channel_target.media_required',
      field: 'media',
      message: `${capability.label} requires at least ${capability.media.minItems} media item(s).`,
      severity: 'error',
    });
  }

  if (
    typeof capability.media.maxItems === 'number' &&
    media.length > capability.media.maxItems
  ) {
    errors.push({
      code: 'channel_target.too_many_media_items',
      field: 'media',
      message: `${capability.label} allows at most ${capability.media.maxItems} media item(s).`,
      severity: 'error',
    });
  }

  const supportedKinds = new Set(capability.media.kinds);
  for (const [index, item] of media.entries()) {
    if (!supportedKinds.has(item.kind)) {
      errors.push({
        code: 'channel_target.unsupported_media_kind',
        field: `media.${index}.kind`,
        message: `${capability.label} does not support ${item.kind} media.`,
        severity: 'error',
      });
    }
  }

  return errors;
}

function validatePublishMode(
  input: ValidateChannelTargetSettingsInput,
  capability: ChannelCapability,
): ChannelValidationIssue[] {
  if (!input.publishMode) {
    return [];
  }

  if (capability.publishModes.includes(input.publishMode)) {
    return [];
  }

  return [
    {
      code: 'channel_target.unsupported_publish_mode',
      field: 'publishMode',
      message: `${capability.label} does not support ${input.publishMode} publishing.`,
      severity: 'error',
    },
  ];
}

function validateSettings(
  input: ValidateChannelTargetSettingsInput,
  capability: ChannelCapability,
): ChannelValidationIssue[] {
  const settings = input.settings ?? {};
  const errors: ChannelValidationIssue[] = [];

  for (const setting of capability.settings) {
    const value = settings[setting.key];
    const field = `settings.${setting.key}`;

    if (isMissingValue(value)) {
      if (setting.required) {
        errors.push({
          code: 'channel_target.required_setting',
          field,
          message: `${capability.label} requires ${setting.label}.`,
          severity: 'error',
        });
      }

      continue;
    }

    errors.push(
      ...validateSettingType(setting, value, capability.label, field),
    );
    errors.push(
      ...validateSettingOptions(setting, value, capability.label, field),
    );
  }

  return errors;
}

function validateSettingType(
  setting: ChannelSettingDefinition,
  value: unknown,
  label: string,
  field: string,
): ChannelValidationIssue[] {
  const typeMatches =
    (setting.type === 'boolean' && typeof value === 'boolean') ||
    (setting.type === 'number' && typeof value === 'number') ||
    (setting.type === 'multi_select' &&
      Array.isArray(value) &&
      value.every((item) => typeof item === 'string')) ||
    (setting.type !== 'boolean' &&
      setting.type !== 'number' &&
      setting.type !== 'multi_select' &&
      typeof value === 'string');

  if (typeMatches) {
    return [];
  }

  return [
    {
      code: 'channel_target.invalid_setting_type',
      field,
      message: `${label} setting ${setting.label} must be a valid ${setting.type} value.`,
      severity: 'error',
    },
  ];
}

function validateSettingOptions(
  setting: ChannelSettingDefinition,
  value: unknown,
  label: string,
  field: string,
): ChannelValidationIssue[] {
  if (!setting.options || setting.options.length === 0) {
    return [];
  }

  const allowedValues = new Set(setting.options.map((option) => option.value));
  const submittedValues = Array.isArray(value) ? value : [value];

  for (const submittedValue of submittedValues) {
    if (
      typeof submittedValue !== 'string' ||
      !allowedValues.has(submittedValue)
    ) {
      return [
        {
          code: 'channel_target.invalid_setting_option',
          field,
          message: `${label} setting ${setting.label} must use one of: ${[
            ...allowedValues,
          ].join(', ')}.`,
          severity: 'error',
        },
      ];
    }
  }

  return [];
}

function isMissingValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}
