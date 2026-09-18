import type { StudioGenerateType } from '@genfeedai/contracts/interfaces';

export interface AgentStudioHandoffIdentity {
  avatarPhotoUrl?: string;
  voiceId?: string;
}

interface IdentitySettingsSource {
  defaultAvatarPhotoUrl?: string | null;
  defaultVoiceRef?: {
    externalVoiceId?: string | null;
  } | null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function didGenerationUseIdentity(params: {
  generationType?: string;
  useIdentity?: boolean;
}): boolean {
  return (
    params.useIdentity === true ||
    params.generationType === 'avatar' ||
    params.generationType === 'voice'
  );
}

export function resolveStudioHandoffType(params: {
  generationType: 'image' | 'video';
  useIdentity?: boolean;
}): StudioGenerateType {
  return didGenerationUseIdentity(params) ? 'avatar' : params.generationType;
}

/**
 * Best-effort snapshot of the brand identity already loaded in the Agent
 * session. The create endpoint re-resolves this authoritatively; this only
 * lets the card send the same fields the payload already models.
 */
export function resolveStudioHandoffIdentityFromSettings(params: {
  brandAgentConfig?: IdentitySettingsSource | null;
  organizationSettings?: IdentitySettingsSource | null;
}): AgentStudioHandoffIdentity {
  const avatarPhotoUrl =
    readOptionalString(params.brandAgentConfig?.defaultAvatarPhotoUrl) ??
    readOptionalString(params.organizationSettings?.defaultAvatarPhotoUrl);
  const voiceId =
    readOptionalString(
      params.brandAgentConfig?.defaultVoiceRef?.externalVoiceId,
    ) ??
    readOptionalString(
      params.organizationSettings?.defaultVoiceRef?.externalVoiceId,
    );

  return {
    ...(avatarPhotoUrl ? { avatarPhotoUrl } : {}),
    ...(voiceId ? { voiceId } : {}),
  };
}
