import { sha256Hex, stableStringify } from '@libs/utils/canonical-hash.util';

export function digestPublishApprovalValue(value: unknown): string {
  return `sha256:v1:${sha256Hex(stableStringify(value))}`;
}
