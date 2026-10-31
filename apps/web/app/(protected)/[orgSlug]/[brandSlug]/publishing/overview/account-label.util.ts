import { formatPlatformLabel } from '@genfeedai/contracts';
import type { ICredential } from '@genfeedai/contracts/interfaces';

/**
 * Best available human label for a channel target's account: the operator's
 * own credential label, then the connected platform handle/name, then a
 * platform-only fallback so a row never renders blank.
 */
export function resolveAccountLabel(
  credential: ICredential | undefined,
  platform: string,
): string {
  return (
    credential?.label ||
    credential?.externalHandle ||
    credential?.externalName ||
    formatPlatformLabel(platform) ||
    'Account'
  );
}
