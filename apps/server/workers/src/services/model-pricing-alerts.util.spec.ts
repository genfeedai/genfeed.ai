import type { ModelScanReport } from '@genfeedai/contracts/interfaces';
import {
  dispatchModelScanCard,
  isModelScanReportEmpty,
  modelScanReportHash,
} from '@workers/services/model-pricing-alerts.util';

const emptyReport: ModelScanReport = {
  dataErrors: [],
  delisted: [],
  newDrafts: [],
  priceChanges: [],
  provider: 'replicate',
  removedByProvider: [],
  startedAt: '2026-11-15T06:00:00.000Z',
  totals: {
    drifted: 0,
    draftsCreated: 0,
    errors: 0,
    newModelsFound: 0,
    polled: 40,
    quarantined: 0,
    synchronized: 40,
  },
  unreadable: [],
};

const withRemoved: ModelScanReport = {
  ...emptyReport,
  removedByProvider: [
    {
      modelKey: 'google/upscaler',
      reason: 'API returned 404',
      sourceUrl: null,
    },
  ],
};

function makeRecorder() {
  const dispatched: Array<Record<string, unknown>> = [];
  return {
    dispatched,
    recorder: {
      dispatch: async (input: Record<string, unknown>) => {
        dispatched.push(input);
      },
    },
  };
}

describe('model scan alerts', () => {
  it('sees an empty report as nothing to send', () => {
    expect(isModelScanReportEmpty(emptyReport)).toBe(true);
    expect(isModelScanReportEmpty(withRemoved)).toBe(false);
  });

  it('hashes the same findings the same way across runs and counters', () => {
    const later: ModelScanReport = {
      ...withRemoved,
      startedAt: '2026-11-22T06:00:00.000Z',
      totals: { ...withRemoved.totals, polled: 41 },
    };

    expect(modelScanReportHash(later)).toBe(modelScanReportHash(withRemoved));
  });

  it('hashes different findings differently', () => {
    const other: ModelScanReport = {
      ...emptyReport,
      delisted: [
        { modelKey: 'google/upscaler', reason: 'page 404', sourceUrl: null },
      ],
    };

    expect(modelScanReportHash(other)).not.toBe(
      modelScanReportHash(withRemoved),
    );
  });

  it('dispatches one operator message with the report and a per-provider key', async () => {
    const { dispatched, recorder } = makeRecorder();

    const isSent = await dispatchModelScanCard(recorder as never, withRemoved);

    expect(isSent).toBe(true);
    expect(dispatched).toEqual([
      {
        deduplicationKey: `message.model-scan/replicate/${modelScanReportHash(withRemoved)}`,
        messages: [
          {
            destination: null,
            message: {
              action: 'model_scan',
              payload: withRemoved,
              type: 'discord',
            },
          },
        ],
        occurredAt: new Date('2026-11-15T06:00:00.000Z'),
        organizationId: null,
        source: { id: 'replicate', type: 'model_scan' },
        topic: 'operator.alerts',
      },
    ]);
  });

  it('sends nothing when the run found nothing', async () => {
    const { dispatched, recorder } = makeRecorder();

    const isSent = await dispatchModelScanCard(recorder as never, emptyReport);

    expect(isSent).toBe(false);
    expect(dispatched).toEqual([]);
  });
});
