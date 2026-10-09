import {
  captureAndDetectNativeSourceExposureObservation,
  captureAndDetectPostExposureObservation,
  collectedBreakoutBaselineOptions,
} from '@api/collections/outliers/services/breakout-collected-signal.util';
import { registerBreakoutResponse } from '@api/collections/outliers/services/breakout-response-identity.util';
import { captureNativeSourceExposureObservation } from '@api/collections/outliers/services/native-source-exposure-observation.util';
import { capturePostExposureObservation } from '@api/collections/outliers/services/post-exposure-observation.util';
import { Platform } from '@genfeedai/contracts';
import {
  type BreakoutCaptureInput,
  type BreakoutNativeCaptureInput,
  outlierConfigurationSchema,
} from '@genfeedai/contracts/interfaces';
import type { OutlierConfiguration, Prisma } from '@genfeedai/prisma';

vi.mock(
  '@api/collections/outliers/services/post-exposure-observation.util',
  () => ({ capturePostExposureObservation: vi.fn() }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-response-identity.util',
  () => ({ registerBreakoutResponse: vi.fn() }),
);

vi.mock(
  '@api/collections/outliers/services/native-source-exposure-observation.util',
  () => ({ captureNativeSourceExposureObservation: vi.fn() }),
);

function harness() {
  const input: BreakoutCaptureInput = {
    source: {
      version: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      credentialId: 'credential-a',
      platform: Platform.TWITTER,
      format: 'text',
      postId: 'post-a',
      externalId: 'tweet-a',
      logicalPostId: 'logical-a',
      contentDigest: 'content-a',
      publicationFingerprint: 'publication-a',
      publishedAt: '2026-10-08T11:00:00Z',
      isResponse: false,
    },
    sourceAttemptId: 'attempt-a',
    requestStartedAt: new Date('2026-10-08T12:00:00Z'),
    receivedAt: new Date('2026-10-08T12:00:02Z'),
    isPinned: null,
    isPromoted: null,
    exposures: {
      impressions: {
        availability: 'observed',
        value: 1000,
        source: 'twitter:post:organic_metrics.impression_count',
        scope: 'organic',
      },
    },
  };
  const configuration = vi.fn(
    async (): Promise<OutlierConfiguration | null> => null,
  );
  const tx = {
    outlierConfiguration: { findFirst: configuration },
  } as unknown as Prisma.TransactionClient;
  const capture = vi.mocked(capturePostExposureObservation);
  capture.mockResolvedValue({
    status: 'captured',
    observationId: 'observation-a',
  });
  const register = vi.mocked(registerBreakoutResponse);
  register.mockResolvedValue({
    status: 'registered',
    responseId: 'response-a',
    triggerReceiptId: 'receipt-a',
  });
  return { input, tx, capture, register, configuration };
}

describe('capture to immediate durable breakout detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:10:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('runs native capture and registration in the same transaction with no Post/actor fallback', async () => {
    const h = harness();
    const { postId: _postId, ...source } = h.input.source;
    const native: BreakoutNativeCaptureInput = {
      ...h.input,
      source: {
        ...source,
        sourceKind: 'native_source_post',
        sourcePostId: 'native-a',
      },
    };
    vi.mocked(captureNativeSourceExposureObservation).mockResolvedValue({
      status: 'captured',
      observationId: 'observation-native',
    });
    expect(
      await captureAndDetectNativeSourceExposureObservation(h.tx, native),
    ).toEqual({ status: 'captured', observationId: 'observation-native' });
    expect(captureNativeSourceExposureObservation).toHaveBeenCalledWith(
      h.tx,
      native,
    );
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.register).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({ targetObservationId: 'observation-native' }),
    );
  });

  it('compares actual measured post age immediately in the same transaction', async () => {
    const h = harness();
    expect(
      await captureAndDetectPostExposureObservation(h.tx, h.input),
    ).toEqual({ status: 'captured', observationId: 'observation-a' });
    expect(h.register).toHaveBeenCalledWith(h.tx, {
      organizationId: 'org-a',
      brandId: 'brand-a',
      credentialId: 'credential-a',
      platform: Platform.TWITTER,
      format: 'text',
      targetObservationId: 'observation-a',
      metric: 'impressions',
      nowMs: Date.now(),
      options: {
        windowAgeMs: 3_601_000,
        toleranceMs: 360_100,
        windowSize: 20,
        minimumSampleSize: 5,
        breakoutThreshold: 10,
      },
    });
    expect(h.capture.mock.invocationCallOrder[0]).toBeLessThan(
      h.register.mock.invocationCallOrder[0],
    );
    expect(h.configuration).toHaveBeenCalledWith({
      where: { organizationId: 'org-a', isDeleted: false },
    });
  });

  it('reconciles a capture replay through the same source registration', async () => {
    const h = harness();
    h.capture.mockResolvedValue({
      status: 'replayed',
      observationId: 'observation-a',
    });
    h.register.mockResolvedValue({
      status: 'replayed',
      responseId: 'response-a',
      triggerReceiptId: 'receipt-a',
    });
    expect(
      await captureAndDetectPostExposureObservation(h.tx, h.input),
    ).toEqual({ status: 'replayed', observationId: 'observation-a' });
    expect(h.register).toHaveBeenCalledOnce();
  });

  it.each([
    'source_changed',
    'attempt_conflict',
    'invalid_collection',
  ] as const)('does not evaluate a held %s capture', async (status) => {
    const h = harness();
    h.capture.mockResolvedValue({ status });
    expect(
      await captureAndDetectPostExposureObservation(h.tx, h.input),
    ).toEqual({ status });
    expect(h.register).not.toHaveBeenCalled();
    expect(h.configuration).not.toHaveBeenCalled();
  });

  it('keeps observed zero eligible for truthful comparison rather than dropping it as missing', async () => {
    const h = harness();
    const impressions = h.input.exposures.impressions;
    if (!impressions) throw new Error('Missing fixture impressions');
    impressions.value = 0;
    h.register.mockResolvedValue({
      status: 'evidence_held',
      reason: 'below_threshold',
    });
    expect(
      await captureAndDetectPostExposureObservation(h.tx, h.input),
    ).toMatchObject({ status: 'captured' });
    expect(h.register).toHaveBeenCalledOnce();
  });

  it.each(['aggregate', 'unknown', 'paid'] as const)(
    'compares available %s measurements with their retained provenance',
    async (scope) => {
      const h = harness();
      const metric = h.input.exposures.impressions;
      if (!metric) throw new Error('Missing fixture impressions');
      metric.scope = scope;
      expect(
        await captureAndDetectPostExposureObservation(h.tx, h.input),
      ).toMatchObject({ status: 'captured' });
      expect(h.capture).toHaveBeenCalledOnce();
      expect(h.register).toHaveBeenCalledOnce();
      expect(h.configuration).toHaveBeenCalledOnce();
    },
  );

  it('retains unavailable evidence without treating a display zero as organic exposure', async () => {
    const h = harness();
    h.input.exposures = {
      views: {
        availability: 'unavailable',
        value: null,
        source: 'twitter:post:views',
        scope: 'unknown',
      },
    };
    await captureAndDetectPostExposureObservation(h.tx, h.input);
    expect(h.register).not.toHaveBeenCalled();
  });

  it('evaluates views and impressions separately while the registry preserves one source identity', async () => {
    const h = harness();
    h.input.exposures.views = {
      availability: 'observed',
      value: 1000,
      source: 'provider:post:organic:views',
      scope: 'organic',
    };
    await captureAndDetectPostExposureObservation(h.tx, h.input);
    expect(h.register.mock.calls.map(([, call]) => call.metric)).toEqual([
      'views',
      'impressions',
    ]);
    expect(
      h.register.mock.calls.map(([, call]) => call.targetObservationId),
    ).toEqual(['observation-a', 'observation-a']);
  });

  it('captures follow-up measurements without creating recursive breakout detections', async () => {
    const h = harness();
    h.input.source.isResponse = true;
    expect(
      await captureAndDetectPostExposureObservation(h.tx, h.input),
    ).toMatchObject({ status: 'captured' });
    expect(h.register).not.toHaveBeenCalled();
  });

  it.each([
    'source_changed',
    'receipt_conflict',
    'identity_conflict',
    'invalid_observation',
  ] as const)(
    'throws on %s so observation and detection cannot commit independently',
    async (status) => {
      const h = harness();
      h.register.mockResolvedValue({ status });
      await expect(
        captureAndDetectPostExposureObservation(h.tx, h.input),
      ).rejects.toThrow(
        `Breakout detection held: ${status}; roll back collection transaction`,
      );
    },
  );

  it('reuses configured bounds and preserves a higher threshold', async () => {
    const h = harness();
    h.configuration.mockResolvedValue({
      id: 'configuration-a',
      organizationId: 'org-a',
      windowSize: 30,
      minimumSampleSize: 5,
      outlierThreshold: 3,
      breakoutThreshold: 15,
      maturityHoursByPlatform: {},
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await captureAndDetectPostExposureObservation(h.tx, h.input);
    expect(h.register).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        options: expect.objectContaining({
          windowSize: 30,
          minimumSampleSize: 5,
          breakoutThreshold: 15,
        }),
      }),
    );
  });

  it('cannot reduce the new breakout signal below tenfold through mature outlier configuration', () => {
    const h = harness();
    expect(
      collectedBreakoutBaselineOptions(
        h.input,
        outlierConfigurationSchema.parse({ breakoutThreshold: 4 }),
      ),
    ).toMatchObject({ breakoutThreshold: 10 });
  });

  it('uses a provider as-of timestamp when supplied', () => {
    const h = harness();
    h.input.providerAsOf = new Date('2026-10-08T11:30:00Z');
    expect(
      collectedBreakoutBaselineOptions(
        h.input,
        outlierConfigurationSchema.parse({}),
      ),
    ).toMatchObject({ windowAgeMs: 1_800_000, toleranceMs: 300_000 });
  });

  it('can retain a comparison for an older source without granting a hot-response lifetime', () => {
    const h = harness();
    h.input.source.publishedAt = '2026-10-01T12:00:01Z';
    expect(
      collectedBreakoutBaselineOptions(
        h.input,
        outlierConfigurationSchema.parse({}),
      ),
    ).toMatchObject({ windowAgeMs: 7 * 86_400_000, toleranceMs: 1_800_000 });
  });

  it('holds invalid or zero sampling age without inventing a window', () => {
    const h = harness();
    h.input.source.publishedAt = 'invalid';
    expect(
      collectedBreakoutBaselineOptions(
        h.input,
        outlierConfigurationSchema.parse({}),
      ),
    ).toBeNull();
    h.input.source.publishedAt = '2026-10-08T12:00:01Z';
    expect(
      collectedBreakoutBaselineOptions(
        h.input,
        outlierConfigurationSchema.parse({}),
      ),
    ).toBeNull();
  });
});
