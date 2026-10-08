import {
  heyGenAvatarRefSchema,
  savedVoiceRefSchema,
} from '@api/services/integrations/heygen/heygen-identity.schema';
import { VoiceProvider } from '@genfeedai/contracts';
import type {
  AgentClipRunIdentity,
  AgentClipRunIdentityField,
  AgentClipRunIdentitySource,
} from '@genfeedai/contracts/interfaces';
import { readRecordOrUndefined } from '@genfeedai/utils/data/extract.util';

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

function isHeygenProvider(value: unknown): boolean {
  return (
    typeof value === 'string' && value.toUpperCase() === VoiceProvider.HEYGEN
  );
}

function readHeygenVoiceIdFromDefaultRef(value: unknown): string | undefined {
  const ref = readRecordOrUndefined(value) as DefaultVoiceRefLike | undefined;

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
  const brandRecord = readRecordOrUndefined(brand);
  const brandAgentConfig = readRecordOrUndefined(brandRecord?.agentConfig);
  const brandAvatar = heyGenAvatarRefSchema.safeParse(
    brandAgentConfig?.defaultAvatarRef,
  );
  const brandAvatarId =
    (brandAvatar.success ? brandAvatar.data.lookId : undefined) ??
    readOptionalString(brandAgentConfig?.heygenAvatarId);
  const brandVoiceId =
    readOptionalString(brandAgentConfig?.heygenVoiceId) ??
    readHeygenVoiceIdFromDefaultRef(brandAgentConfig?.defaultVoiceRef) ??
    (isHeygenProvider(brandAgentConfig?.defaultVoiceProvider)
      ? readOptionalString(brandAgentConfig?.defaultVoiceId)
      : undefined);
  const organizationSettingsRecord =
    readRecordOrUndefined(organizationSettings);
  const organizationAvatar = heyGenAvatarRefSchema.safeParse(
    organizationSettingsRecord?.defaultAvatarRef,
  );
  const organizationAvatarId = organizationAvatar.success
    ? organizationAvatar.data.lookId
    : undefined;
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
        : organizationAvatarId || organizationVoiceId
          ? 'organization'
          : 'missing';
  const resolvedAvatarId =
    explicitAvatarId ?? brandAvatarId ?? organizationAvatarId;
  const resolvedVoiceId =
    explicitVoiceId ?? brandVoiceId ?? organizationVoiceId;
  const missing: AgentClipRunIdentityField[] = [];

  if (!resolvedAvatarId) {
    missing.push('avatar');
  }

  if (!resolvedVoiceId) {
    missing.push('voice');
  }

  const avatarRef = !explicitAvatarId
    ? brandAvatar.success
      ? brandAvatar.data
      : !brandAvatarId && organizationAvatar.success
        ? organizationAvatar.data
        : undefined
    : undefined;
  const voice = savedVoiceRefSchema.safeParse(
    !explicitVoiceId
      ? (brandAgentConfig?.defaultVoiceRef ??
          organizationSettingsRecord?.defaultVoiceRef)
      : undefined,
  );
  return {
    ...(avatarRef ? { avatarRef } : {}),
    ...(voice.success ? { voiceRef: voice.data } : {}),
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
