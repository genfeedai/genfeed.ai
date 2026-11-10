import type { ToolDataSource } from '../../interfaces/tool-definition.interface';
import {
  curatedActionNames,
  getCuratedAction,
} from '../curated-action-catalog';

/**
 * Reads that call a third party and bill per call (credits or a platform
 * fee). They keep the cost confirmation and are the only `fetch_*` tools.
 * Declared as `dataSource: 'provider-paid'` in the curated catalog.
 */
export const PROVIDER_PAID_TOOLS: ReadonlySet<string> = curatedActionNames(
  (entry) => entry.dataSource === 'provider-paid',
);

/**
 * Reads that call a live third party (ad platforms, the ad library, the
 * embedding provider) with no per-call cost to the caller. Read-only, but
 * open-world. Declared as `dataSource: 'provider'` in the curated catalog;
 * everything else reads our own database.
 */
export const PROVIDER_FREE_TOOLS: ReadonlySet<string> = curatedActionNames(
  (entry) => entry.dataSource === 'provider',
);

export function toolDataSource(name: string): ToolDataSource {
  return getCuratedAction(name)?.dataSource ?? 'stored';
}
