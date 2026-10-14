import type {
  HeyGenAvatarRef,
  HeyGenConnectionRef,
} from '@genfeedai/contracts/interfaces';

/** The key exists only during admission/submission, never in persisted refs. */
export interface ResolvedHeyGenConnection {
  apiKey: string;
  binding: HeyGenConnectionRef & { credentialVersionId: string };
}

export interface HeyGenAvatarCandidate {
  source?: 'heygen-look';
  lookId: string;
  groupId?: string | null;
  ownership: 'private' | 'public';
  connection?: HeyGenConnectionRef;
}

/** The look fields a native render needs: its id and its engine evidence. */
export type HeyGenNativeAvatar = Pick<
  HeyGenAvatarRef,
  'avatarType' | 'lookId' | 'supportedEngines'
>;
