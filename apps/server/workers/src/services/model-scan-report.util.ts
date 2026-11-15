import type {
  ModelScanProvider,
  ModelScanReport,
} from '@genfeedai/contracts/interfaces';
import type { IModelDiscoveryRunSummary } from '@workers/interfaces/model-discovery.interface';

/** An empty summary, with an empty report, for one provider scan. */
export function createModelDiscoveryRunSummary(
  provider: ModelScanProvider,
  timestamp: Date = new Date(),
): IModelDiscoveryRunSummary {
  return {
    draftsCreated: 0,
    errors: 0,
    newModelsFound: 0,
    providerContractsDrifted: 0,
    providerContractsQuarantined: 0,
    providerContractsSynchronized: 0,
    report: {
      dataErrors: [],
      delisted: [],
      newDrafts: [],
      priceChanges: [],
      provider,
      removedByProvider: [],
      startedAt: timestamp.toISOString(),
      totals: {
        draftsCreated: 0,
        drifted: 0,
        errors: 0,
        newModelsFound: 0,
        polled: 0,
        quarantined: 0,
        synchronized: 0,
      },
      unreadable: [],
    },
    timestamp,
    totalPolled: 0,
  };
}

/** Copy the run's counters onto its report once the run is over. */
export function finalizeModelScanReport(
  summary: IModelDiscoveryRunSummary,
): ModelScanReport {
  summary.report.totals = {
    draftsCreated: summary.draftsCreated,
    drifted: summary.providerContractsDrifted ?? 0,
    errors: summary.errors,
    newModelsFound: summary.newModelsFound,
    polled: summary.totalPolled,
    quarantined: summary.providerContractsQuarantined ?? 0,
    synchronized: summary.providerContractsSynchronized ?? 0,
  };
  return summary.report;
}
