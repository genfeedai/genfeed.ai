import type { SocialInboxReference } from '@genfeedai/contracts/interfaces';

export interface MessagesSurfaceAdapterParams {
  readonly references: readonly SocialInboxReference[];
}
