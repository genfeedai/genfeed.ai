import type { PlatformFlagKey } from '@genfeedai/contracts/constants';
import type { IPlatformFlags } from '@genfeedai/contracts/interfaces';

/** One top-level flag on Admin → Flags with every flag nested under it. */
export interface AdminFlagCardProps {
  /** Flags in effect once parents apply (`resolvePlatformFlags`). */
  effectiveFlags: IPlatformFlags;
  flagKey: PlatformFlagKey;
  /** Stored switches, as the operator left them. */
  flags: IPlatformFlags;
  isDisabled: boolean;
  /** Every flag nested under `flagKey`, depth first. */
  nestedKeys: readonly PlatformFlagKey[];
  onToggle: (key: PlatformFlagKey, isOn: boolean) => void;
}
