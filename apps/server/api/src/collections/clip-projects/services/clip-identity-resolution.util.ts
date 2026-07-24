import { VoiceProvider } from '@genfeedai/enums';
import type {
  AgentClipRunIdentity,
  AgentClipRunIdentityField,
  AgentClipRunIdentitySource,
} from '@genfeedai/interfaces';

export interface ClipIdentityResolutionInput {
  avatarId?: string;
  avatarProvider?: string;
  brand?: unknown;
  organizationSettings?: unknown;
  voiceId?: string;
  voiceProvider?: string;
}

interface DefaultVoiceRefLike {
  externalVoiceId?: unknown;
  provider?: unknown;
  source?: unknown;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isHeygenProvider(value: unknown): boolean {
  return (
    typeof value === 'string' && value.toLowerCase() === VoiceProvider.HEYGEN
  );
}

function readHeygenVoiceIdFromDefaultRef(value: unknown): string | undefined {
  const ref = readRecord(value) as DefaultVoiceRefLike | undefined;

  if (ref?.source !== 'catalog' || !isHeygenProvider(ref.provider)) {
    return undefined;
  }

  return readOptionalString(ref.externalVoiceId);
}

function getIdentityLabel(
  source: AgentClipRunIdentitySource,
  missing: AgentClipRunIdentityField[],
): string {
  if (missing.length > 0) {
    return `Missing ${missing.join(' and ')} defaults`;
  }

  switch (source) {
    case 'explicit':
      return 'Explicit clip identity';
    case 'brand':
      return 'Brand clip defaults';
    case 'organization':
      return 'Organization clip defaults';
    default:
      return 'Clip identity defaults';
  }
}

export function resolveClipIdentity({
  avatarId: requestedAvatarId,
  avatarProvider,
  brand,
  organizationSettings,
  voiceId: requestedVoiceId,
  voiceProvider,
}: ClipIdentityResolutionInput): AgentClipRunIdentity {
  const explicitAvatarId = readOptionalString(requestedAvatarId);
  const explicitVoiceId = readOptionalString(requestedVoiceId);
  const brandRecord = readRecord(brand);
  const brandAgentConfig = readRecord(brandRecord?.agentConfig);
  const brandAvatarId = readOptionalString(brandAgentConfig?.heygenAvatarId);
  const brandVoiceId =
    readOptionalString(brandAgentConfig?.heygenVoiceId) ??
    readHeygenVoiceIdFromDefaultRef(brandAgentConfig?.defaultVoiceRef) ??
    (isHeygenProvider(brandAgentConfig?.defaultVoiceProvider)
      ? readOptionalString(brandAgentConfig?.defaultVoiceId)
      : undefined);
  const organizationSettingsRecord = readRecord(organizationSettings);
  const organizationVoiceId =
    readHeygenVoiceIdFromDefaultRef(
      organizationSettingsRecord?.defaultVoiceRef,
    ) ??
    (isHeygenProvider(organizationSettingsRecord?.defaultVoiceProvider)
      ? readOptionalString(organizationSettingsRecord?.defaultVoiceId)
      : undefined);
  const source: AgentClipRunIdentitySource =
    explicitAvatarId || explicitVoiceId
      ? 'explicit'
      : brandAvatarId || brandVoiceId
        ? 'brand'
        : organizationVoiceId
          ? 'organization'
          : 'missing';
  const resolvedAvatarId = explicitAvatarId ?? brandAvatarId;
  const resolvedVoiceId =
    explicitVoiceId ?? brandVoiceId ?? organizationVoiceId;
  const missing: AgentClipRunIdentityField[] = [];

  if (!resolvedAvatarId) {
    missing.push('avatar');
  }

  if (!resolvedVoiceId) {
    missing.push('voice');
  }

  return {
    avatarId: resolvedAvatarId,
    avatarProvider:
      readOptionalString(avatarProvider) ??
      (resolvedAvatarId ? VoiceProvider.HEYGEN : undefined),
    isComplete: missing.length === 0,
    label: getIdentityLabel(source, missing),
    missing,
    source,
    useIdentity: true,
    voiceId: resolvedVoiceId,
    voiceProvider:
      readOptionalString(voiceProvider) ??
      (resolvedVoiceId ? VoiceProvider.HEYGEN : undefined),
  };
}
