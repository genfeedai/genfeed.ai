import type {
  AgentStudioHandoffPayload,
  StudioGenerateType,
} from '@genfeedai/contracts/interfaces';

export interface StudioHandoffIdentityFields {
  avatarPhotoUrl?: string;
  voiceId?: string;
}

export function shouldAttachStudioHandoffIdentity(
  type: StudioGenerateType,
  useIdentity?: boolean,
): boolean {
  return useIdentity === true || type === 'avatar' || type === 'voice';
}

/**
 * Identity generations open Studio on the avatar/voice surface so the
 * snapshotted portrait and voice are actually visible. Music stays music.
 */
export function resolveStudioHandoffPayloadType(
  type: StudioGenerateType,
  useIdentity?: boolean,
): StudioGenerateType {
  if (type === 'avatar' || type === 'voice' || type === 'music') {
    return type;
  }
  return useIdentity === true ? 'avatar' : type;
}

export function readOptionalIdentityString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function pickStudioHandoffIdentityFields(input: {
  avatarPhotoUrl?: unknown;
  voiceId?: unknown;
}): StudioHandoffIdentityFields {
  const avatarPhotoUrl = readOptionalIdentityString(input.avatarPhotoUrl);
  const voiceId = readOptionalIdentityString(input.voiceId);
  return {
    ...(avatarPhotoUrl ? { avatarPhotoUrl } : {}),
    ...(voiceId ? { voiceId } : {}),
  };
}

export function omitUnattachedStudioHandoffIdentity(
  payload: AgentStudioHandoffPayload,
): AgentStudioHandoffPayload {
  const {
    avatarPhotoUrl: _avatarPhotoUrl,
    useIdentity: _useIdentity,
    voiceId: _voiceId,
    ...rest
  } = payload;
  return rest;
}
