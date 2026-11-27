import { AsyncLocalStorage } from 'node:async_hooks';
import type { ResearchScanLibrary } from '@genfeedai/contracts/interfaces';

/**
 * The scan an in-flight collection belongs to. A scan is reserved before any
 * run starts; while it runs, `ResearchAccessService.decide` lets that
 * organization's collection through even without a plan, because the scan
 * limit, not the plan, is what admits it.
 */
export interface ResearchScanGrant {
  /** True once a request reached the scraper. Only then does the scan count. */
  hasStartedRun: boolean;
  library: ResearchScanLibrary;
  organizationId: string;
  /** The reserved row, or null for a scan nothing counts (an unlimited tier). */
  scanId: string | null;
}

const grants = new AsyncLocalStorage<ResearchScanGrant>();

export function runWithResearchScanGrant<T>(
  grant: ResearchScanGrant,
  run: () => Promise<T>,
): Promise<T> {
  return grants.run(grant, run);
}

export function getResearchScanGrant(
  organizationId: string,
): ResearchScanGrant | undefined {
  const grant = grants.getStore();
  return grant?.organizationId === organizationId ? grant : undefined;
}

/** A run reached the scraper under this organization's scan: keep the scan counted. */
export function noteResearchRunStarted(organizationId: string): void {
  const grant = getResearchScanGrant(organizationId);
  if (grant) grant.hasStartedRun = true;
}
