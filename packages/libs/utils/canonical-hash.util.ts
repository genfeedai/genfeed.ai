import { createHash } from 'node:crypto';

// The implementation lives in contracts so packages that cannot depend on
// libs (e.g. @genfeedai/actions) share the exact same canonical JSON.
export { stableStringify } from '@genfeedai/contracts/constants/canonical-json.constant';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
