import type {
  AgentPublishSettingField,
  AgentPublishTargetProposal,
  AgentPublishValidationIssue,
} from '@genfeedai/agent/models/agent-chat.model';
import { PostVisibility } from '@genfeedai/contracts';
import { validateChannelTargetSettings } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';

const VISIBILITY_VALUES = [
  PostVisibility.PRIVATE,
  PostVisibility.PUBLIC,
  PostVisibility.UNLISTED,
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readVisibility(value: unknown): PostVisibility {
  return value === PostVisibility.PRIVATE ||
    value === PostVisibility.PUBLIC ||
    value === PostVisibility.UNLISTED
    ? value
    : PostVisibility.PUBLIC;
}

function readSettingDefault(
  value: unknown,
): boolean | number | string | string[] | undefined {
  if (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  return undefined;
}

function readSettingFields(value: unknown): AgentPublishSettingField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const key = readString(item.key);
    const label = readString(item.label);
    const type = item.type;
    if (
      !key ||
      !label ||
      (type !== 'boolean' &&
        type !== 'multi_select' &&
        type !== 'number' &&
        type !== 'select' &&
        type !== 'string' &&
        type !== 'text' &&
        type !== 'url')
    ) {
      return [];
    }

    const options = Array.isArray(item.options)
      ? item.options.flatMap((option) => {
          if (!isRecord(option)) {
            return [];
          }
          const optionLabel = readString(option.label);
          const optionValue = readString(option.value);
          return optionLabel && optionValue
            ? [{ label: optionLabel, value: optionValue }]
            : [];
        })
      : undefined;
    const defaultValue = readSettingDefault(item.defaultValue);

    return [
      {
        ...(defaultValue !== undefined ? { defaultValue } : {}),
        ...(readString(item.description)
          ? { description: readString(item.description) }
          : {}),
        key,
        label,
        ...(options ? { options } : {}),
        ...(typeof item.required === 'boolean'
          ? { required: item.required }
          : {}),
        type,
      },
    ];
  });
}

function readIssues(value: unknown): AgentPublishValidationIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const code = readString(item.code);
    const message = readString(item.message);
    if (
      !code ||
      !message ||
      (item.severity !== 'error' && item.severity !== 'warning')
    ) {
      return [];
    }

    return [
      {
        code,
        ...(readString(item.field) ? { field: readString(item.field) } : {}),
        message,
        severity: item.severity,
      },
    ];
  });
}

function readMedia(value: unknown): AgentPublishTargetProposal['media'] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const media = value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const kind = item.kind;
    if (
      kind !== 'carousel' &&
      kind !== 'image' &&
      kind !== 'link' &&
      kind !== 'short_video' &&
      kind !== 'video'
    ) {
      return [];
    }

    const mediaKind: NonNullable<
      AgentPublishTargetProposal['media']
    >[number]['kind'] = kind;

    return [
      {
        ...(readString(item.id) ? { id: readString(item.id) } : {}),
        ...(typeof item.isAnimated === 'boolean'
          ? { isAnimated: item.isAnimated }
          : {}),
        kind: mediaKind,
      },
    ];
  });

  return media.length > 0 ? media : undefined;
}

export function readPublishTargetProposals(
  value: unknown,
): AgentPublishTargetProposal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const credentialId = readString(item.credentialId);
    const platform = readString(item.platform);
    const id = readString(item.id) ?? credentialId;
    if (!credentialId || !platform || !id) {
      return [];
    }

    const settings = isRecord(item.settings) ? { ...item.settings } : {};

    return [
      {
        blockers: readIssues(item.blockers),
        caption: readString(item.caption),
        captionMaxLength:
          typeof item.captionMaxLength === 'number'
            ? item.captionMaxLength
            : undefined,
        credentialId,
        id,
        isCaptionRequired:
          typeof item.isCaptionRequired === 'boolean'
            ? item.isCaptionRequired
            : undefined,
        isSelected:
          typeof item.isSelected === 'boolean' ? item.isSelected : undefined,
        label: readString(item.label) ?? platform,
        media: readMedia(item.media),
        platform,
        settingFields: readSettingFields(item.settingFields),
        settings,
        signatureIds: Array.isArray(item.signatureIds)
          ? item.signatureIds.filter(
              (signatureId): signatureId is string =>
                typeof signatureId === 'string' &&
                signatureId.trim().length > 0,
            )
          : undefined,
        scheduledAt:
          readString(item.scheduledAt) ?? readString(item.scheduledDate),
        timezone: readString(item.timezone),
        visibility: readVisibility(item.visibility),
        warnings: readIssues(item.warnings),
        referenceState: readString(item.referenceState),
      },
    ];
  });
}

export function targetToggleName(
  target: AgentPublishTargetProposal,
  all: AgentPublishTargetProposal[],
): string {
  const samePlatformCount = all.filter(
    (candidate) => candidate.platform === target.platform,
  ).length;
  return samePlatformCount > 1
    ? `${target.platform} ${target.credentialId}`
    : target.platform;
}

export function resolveEffectiveCaption(
  sharedCaption: string,
  override: string | undefined,
): string | undefined {
  const trimmedOverride = override?.trim();
  if (trimmedOverride) {
    return trimmedOverride;
  }
  const trimmedShared = sharedCaption.trim();
  return trimmedShared.length > 0 ? trimmedShared : undefined;
}

export function resolveLiveTargetBlockers(params: {
  caption?: string;
  credentialId: string;
  media: AgentPublishTargetProposal['media'];
  platform: string;
  publishMode: 'draft' | 'publish_now' | 'scheduled';
  settings: Record<string, unknown>;
  visibility: PostVisibility;
}): AgentPublishValidationIssue[] {
  const result = validateChannelTargetSettings({
    caption: params.caption,
    credentialId: params.credentialId,
    media: params.media,
    platform: params.platform,
    publishMode: params.publishMode,
    settings: params.settings,
    visibility: params.visibility,
  });

  return result.errors.map((issue) => ({
    code: issue.code,
    ...(issue.field ? { field: issue.field } : {}),
    message: issue.message,
    severity: issue.severity,
  }));
}

export function readPostVisibilityValue(value: string): PostVisibility {
  const match = VISIBILITY_VALUES.find((candidate) => candidate === value);
  return match ?? PostVisibility.PUBLIC;
}

export { VISIBILITY_VALUES };
