import { isRecord } from '@genfeedai/utils/data/extract.util';
export function readRecordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
