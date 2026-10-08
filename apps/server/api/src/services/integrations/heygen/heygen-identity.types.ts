import type { HeyGenConnectionRef } from '@genfeedai/contracts/interfaces';

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
