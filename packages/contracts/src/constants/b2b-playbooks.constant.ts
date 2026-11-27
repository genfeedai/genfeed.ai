import type { B2bPlaybook } from '../api-types/contracts/b2b-playbook.contract';
import { B2B_PLAYBOOK_DATA } from './preset-catalog.generated';

/** Defined in genfeedai/catalog and pinned into `presets/`; see `scripts/sync-product-presets.ts`. */
export const B2B_PLAYBOOKS = B2B_PLAYBOOK_DATA as unknown as B2bPlaybook[];

export function b2bPlaybookId(key: string): string {
  return `cpresetbuiltin${key.replaceAll('-', '')}`;
}
