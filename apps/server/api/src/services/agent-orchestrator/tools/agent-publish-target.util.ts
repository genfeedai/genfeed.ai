import {
  type ChannelMediaKind,
  type ChannelPublishMode,
  getChannelCapability,
  resolveChannelTargetSettings,
  validateChannelTargetSettings,
} from '@api-types/contracts/channel-capabilities.contract';
import type { ChannelTargetInput } from '@api-types/contracts/scheduler.contract';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
  IngredientCategory,
  PostVisibility,
  parsePlatform,
  ReleaseAttachmentKind,
} from '@genfeedai/enums';
import type {
  AgentPublishSettingField,
  AgentPublishTargetMedia,
  AgentPublishTargetPayload,
  AgentPublishTargetProposal,
  AgentPublishValidationIssue,
} from '@genfeedai/interfaces';

const CHANNEL_MEDIA_KINDS = new Set<ChannelMediaKind>([
  'carousel',
  'image',
  'link',
  'short_video',
  'video',
]);

const SETTING_FIELD_TYPES = new Set<AgentPublishSettingField['type']>([
  'boolean',
  'multi_select',
  'number',
  'select',
  'string',
  'text',
  'url',
]);

export function readDomainPlatform(
  value: unknown,
): CredentialPlatform | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  return fromPrismaCredentialPlatform(value) ?? parsePlatform(value);
}

export function readCredentialId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function readPostVisibility(
  value: unknown,
  fallback: PostVisibility = PostVisibility.PUBLIC,
): PostVisibility {
  return value === PostVisibility.PRIVATE ||
    value === PostVisibility.PUBLIC ||
    value === PostVisibility.UNLISTED
    ? value
    : fallback;
}

export function resolvePublishValidationMedia(
  ingredient: Record<string, unknown>,
  contentId: string,
): AgentPublishTargetMedia[] {
  const rawCategory =
    typeof ingredient.category === 'string' ? ingredient.category : '';
  const category = rawCategory.toUpperCase();

  if (
    category === IngredientCategory.IMAGE ||
    category === IngredientCategory.IMAGE_EDIT
  ) {
    return [{ id: contentId, kind: 'image' }];
  }

  if (category === IngredientCategory.GIF) {
    return [{ id: contentId, isAnimated: true, kind: 'image' }];
  }

  if (
    category === IngredientCategory.VIDEO ||
    category === IngredientCategory.VIDEO_EDIT
  ) {
    return [{ id: contentId, kind: 'video' }];
  }

  return [];
}

export function resolvePublishMediaKind(category: unknown): string | undefined {
  const media = resolvePublishValidationMedia({ category }, 'media');
  return media[0]?.kind;
}

function isChannelMediaKind(kind: string): kind is ChannelMediaKind {
  return CHANNEL_MEDIA_KINDS.has(kind as ChannelMediaKind);
}

function toValidationMedia(
  media: AgentPublishTargetMedia[] | undefined,
): Array<{ id?: string; isAnimated?: boolean; kind: ChannelMediaKind }> {
  if (!media) {
    return [];
  }

  return media.flatMap((item) =>
    isChannelMediaKind(item.kind)
      ? [
          {
            ...(item.id ? { id: item.id } : {}),
            ...(item.isAnimated !== undefined
              ? { isAnimated: item.isAnimated }
              : {}),
            kind: item.kind,
          },
        ]
      : [],
  );
}

function toSettingFields(
  platform: CredentialPlatform,
): AgentPublishSettingField[] {
  const capability = getChannelCapability(platform);
  if (!capability) {
    return [];
  }

  return capability.settings.flatMap((setting) => {
    if (!SETTING_FIELD_TYPES.has(setting.type)) {
      return [];
    }

    return [
      {
        ...(setting.defaultValue !== undefined
          ? { defaultValue: setting.defaultValue }
          : {}),
        ...(setting.description ? { description: setting.description } : {}),
        key: setting.key,
        label: setting.label,
        ...(setting.options
          ? {
              options: setting.options.map((option) => ({
                label: option.label,
                value: option.value,
              })),
            }
          : {}),
        ...(setting.required !== undefined
          ? { required: setting.required }
          : {}),
        type: setting.type,
      },
    ];
  });
}

function toValidationIssues(
  issues: Array<{
    code: string;
    field?: string;
    message: string;
    severity: 'error' | 'warning';
  }>,
): AgentPublishValidationIssue[] {
  return issues.map((issue) => ({
    code: issue.code,
    ...(issue.field ? { field: issue.field } : {}),
    message: issue.message,
    severity: issue.severity,
  }));
}

export function defaultTargetSettings(
  platform: CredentialPlatform,
  settings?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...resolveChannelTargetSettings(platform, {}),
    ...(settings ?? {}),
  };
}

export function validatePublishTarget(params: {
  caption?: string;
  credentialId: string;
  media?: AgentPublishTargetMedia[];
  platform: string;
  publishMode: ChannelPublishMode;
  settings?: Record<string, unknown>;
  visibility?: PostVisibility;
}): {
  blockers: AgentPublishValidationIssue[];
  platform: CredentialPlatform | string;
  warnings: AgentPublishValidationIssue[];
} {
  const result = validateChannelTargetSettings({
    caption: params.caption,
    credentialId: params.credentialId,
    media: toValidationMedia(params.media),
    platform: params.platform,
    publishMode: params.publishMode,
    settings: params.settings ?? {},
    visibility: params.visibility,
  });

  return {
    blockers: toValidationIssues(result.errors),
    platform: result.platform,
    warnings: toValidationIssues(result.warnings),
  };
}

export function buildAgentPublishTargetProposal(params: {
  caption?: string;
  credentialId: string;
  isSelected: boolean;
  media: AgentPublishTargetMedia[];
  platform: CredentialPlatform;
  publishMode: ChannelPublishMode;
  visibility: PostVisibility;
}): AgentPublishTargetProposal {
  const capability = getChannelCapability(params.platform);
  const settings = defaultTargetSettings(params.platform);
  const validation = validatePublishTarget({
    caption: params.caption,
    credentialId: params.credentialId,
    media: params.media,
    platform: params.platform,
    publishMode: params.publishMode,
    settings,
    visibility: params.visibility,
  });

  return {
    blockers: validation.blockers,
    caption: params.caption,
    captionMaxLength: capability?.caption.maxLength,
    credentialId: params.credentialId,
    id: `publish-target-${params.credentialId}`,
    isCaptionRequired: capability?.caption.required,
    isSelected: params.isSelected,
    label: capability?.label ?? params.platform,
    media: params.media,
    platform: params.platform,
    settingFields: toSettingFields(params.platform),
    settings,
    visibility: params.visibility,
    warnings: validation.warnings,
  };
}

export function buildAgentPublishTargetProposals(params: {
  caption?: string;
  credentials: Array<{ id?: unknown; platform?: unknown }>;
  defaultPlatforms: string[];
  media: AgentPublishTargetMedia[];
  publishMode: ChannelPublishMode;
  visibility: PostVisibility;
}): AgentPublishTargetProposal[] {
  const selectedPlatforms = new Set(params.defaultPlatforms);
  const proposals: AgentPublishTargetProposal[] = [];
  const seenCredentialIds = new Set<string>();

  for (const credential of params.credentials) {
    const credentialId = readCredentialId(credential.id);
    const platform = readDomainPlatform(credential.platform);
    if (!credentialId || !platform || seenCredentialIds.has(credentialId)) {
      continue;
    }

    seenCredentialIds.add(credentialId);
    proposals.push(
      buildAgentPublishTargetProposal({
        caption: params.caption,
        credentialId,
        isSelected:
          selectedPlatforms.size === 0 || selectedPlatforms.has(platform),
        media: params.media,
        platform,
        publishMode: params.publishMode,
        visibility: params.visibility,
      }),
    );
  }

  return proposals;
}

function readSettings(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return { ...(value as Record<string, unknown>) };
}

export function parseAgentPublishTargetPayloads(
  value: unknown,
): AgentPublishTargetPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const payloads: AgentPublishTargetPayload[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const credentialId = readCredentialId(record.credentialId);
    const platform = readDomainPlatform(record.platform);
    if (!credentialId || !platform || seen.has(credentialId)) {
      continue;
    }

    seen.add(credentialId);
    const caption =
      typeof record.caption === 'string' && record.caption.trim().length > 0
        ? record.caption.trim()
        : undefined;
    const scheduledAt =
      readCredentialId(record.scheduledAt) ??
      readCredentialId(record.scheduledDate);
    const timezone = readCredentialId(record.timezone);
    const signatureIds = Array.isArray(record.signatureIds)
      ? record.signatureIds.filter(
          (signatureId): signatureId is string =>
            typeof signatureId === 'string' && signatureId.trim().length > 0,
        )
      : undefined;
    payloads.push({
      ...readAttachments(record.attachments),
      ...(caption ? { caption } : {}),
      credentialId,
      platform,
      ...(scheduledAt ? { scheduledAt } : {}),
      ...(readSettings(record.settings)
        ? { settings: readSettings(record.settings) }
        : {}),
      ...(signatureIds && signatureIds.length > 0 ? { signatureIds } : {}),
      ...(timezone ? { timezone } : {}),
      visibility: readPostVisibility(record.visibility),
    });
  }

  return payloads;
}

export function formatTargetBlockersError(
  blockers: Array<{ label: string; messages: string[] }>,
): string {
  const parts = blockers.flatMap((blocker) =>
    blocker.messages.map((message) => `${blocker.label}: ${message}`),
  );
  return parts.join(' ');
}

export function toCanonicalChannelTarget(params: {
  attachments?: AgentPublishTargetPayload['attachments'];
  caption?: string;
  credentialId: string;
  order: number;
  platform: CredentialPlatform;
  scheduledAt?: string;
  settings?: Record<string, unknown>;
  timezone?: string;
  visibility: PostVisibility;
}): ChannelTargetInput {
  const settings = defaultTargetSettings(params.platform, params.settings);
  const attachments = toChannelTargetAttachments(params.attachments);

  return {
    ...(attachments ? { attachments } : {}),
    ...(params.caption ? { caption: params.caption } : {}),
    credentialId: params.credentialId,
    order: params.order,
    platform: params.platform,
    ...(params.scheduledAt ? { scheduledDate: params.scheduledAt } : {}),
    settings,
    ...(params.timezone ? { timezone: params.timezone } : {}),
    visibility: params.visibility,
  };
}

function readAttachments(
  value: unknown,
): Pick<AgentPublishTargetPayload, 'attachments'> {
  if (!Array.isArray(value)) {
    return {};
  }

  const attachments = value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const body = readCredentialId(record.body);
    if (!body) {
      return [];
    }
    const kind =
      record.kind === ReleaseAttachmentKind.SIGNATURE ||
      record.kind === ReleaseAttachmentKind.COMMENT ||
      record.kind === ReleaseAttachmentKind.THREAD
        ? record.kind
        : ReleaseAttachmentKind.SIGNATURE;
    return [
      {
        body,
        kind,
        ...(typeof record.order === 'number' ? { order: record.order } : {}),
        ...(readCredentialId(record.platform)
          ? { platform: readCredentialId(record.platform) }
          : {}),
      },
    ];
  });

  return attachments.length > 0 ? { attachments } : {};
}

function toChannelTargetAttachments(
  attachments: AgentPublishTargetPayload['attachments'],
): ChannelTargetInput['attachments'] {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  return attachments.map((attachment, order) => ({
    body: attachment.body,
    kind:
      attachment.kind === ReleaseAttachmentKind.COMMENT ||
      attachment.kind === ReleaseAttachmentKind.THREAD
        ? attachment.kind
        : ReleaseAttachmentKind.SIGNATURE,
    order: attachment.order ?? order,
    ...(parsePlatform(attachment.platform)
      ? { platform: parsePlatform(attachment.platform) }
      : {}),
  }));
}

export function collectInvalidTargetBlockers(params: {
  caption?: string;
  media?: AgentPublishTargetMedia[];
  publishMode: ChannelPublishMode;
  targets: Array<{
    caption?: string;
    credentialId: string;
    platform: string;
    settings?: Record<string, unknown>;
    visibility?: PostVisibility;
  }>;
  visibility: PostVisibility;
}): Array<{ label: string; messages: string[] }> {
  const invalid: Array<{ label: string; messages: string[] }> = [];

  for (const target of params.targets) {
    const platform = readDomainPlatform(target.platform);
    if (!platform) {
      invalid.push({
        label: target.platform,
        messages: [
          `Platform "${target.platform}" is not supported by scheduler channel validation.`,
        ],
      });
      continue;
    }

    const settings = defaultTargetSettings(platform, target.settings);
    const validation = validatePublishTarget({
      caption: target.caption ?? params.caption,
      credentialId: target.credentialId,
      media: params.media,
      platform,
      publishMode: params.publishMode,
      settings,
      visibility: target.visibility ?? params.visibility,
    });

    if (validation.blockers.length > 0) {
      const capability = getChannelCapability(platform);
      invalid.push({
        label: capability?.label ?? platform,
        messages: validation.blockers.map((blocker) => blocker.message),
      });
    }
  }

  return invalid;
}
