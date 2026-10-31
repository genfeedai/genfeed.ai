import type { SocialInboxSyncRealtimeEvent } from '@genfeedai/contracts/interfaces';

export interface UseMessagesRealtimeParams {
  readonly onRefresh: () => void | Promise<void>;
  /** Called when a background inbox sync job ends, so the screen can show its result. */
  readonly onSyncResult?: (event: SocialInboxSyncRealtimeEvent) => void;
  readonly organizationId?: string;
}
