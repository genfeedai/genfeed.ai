import { registerBreakoutResponse } from '@api/collections/outliers/services/breakout-response-identity.util';
import { captureNativeSourceExposureObservation } from '@api/collections/outliers/services/native-source-exposure-observation.util';
import { capturePostExposureObservation } from '@api/collections/outliers/services/post-exposure-observation.util';
import {
  type BreakoutAnyCaptureInput,
  type BreakoutBaselineOptions,
  type BreakoutCaptureInput,
  type BreakoutCaptureResult,
  type BreakoutNativeCaptureInput,
  type OutlierConfigurationValues,
  outlierConfigurationSchema,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

/** Sampling policy only. Actual response lifetime/growth is a separate execution gate. */
export function collectedBreakoutBaselineOptions(
  input: Readonly<BreakoutAnyCaptureInput>,
  configuration: Readonly<OutlierConfigurationValues>,
): BreakoutBaselineOptions | null {
  const measuredAt =
    input.providerAsOf?.getTime() ??
    (input.requestStartedAt.getTime() + input.receivedAt.getTime()) / 2;
  const windowAgeMs = Math.round(
    measuredAt - Date.parse(input.source.publishedAt),
  );
  if (!Number.isSafeInteger(windowAgeMs) || windowAgeMs <= 0) return null;
  const toleranceMs = Math.min(
    windowAgeMs - 1,
    30 * 60_000,
    Math.max(5 * 60_000, Math.round(windowAgeMs / 10)),
  );
  return {
    windowAgeMs,
    toleranceMs,
    windowSize: configuration.windowSize,
    minimumSampleSize: configuration.minimumSampleSize,
    breakoutThreshold: Math.max(10, configuration.breakoutThreshold),
  };
}

/** One transaction: trustworthy capture → comparison receipt → detected response identity.
 * Detection never queues generation, spends credits, changes schedules or authorizes publication.
 */
export async function captureAndDetectPostExposureObservation(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutCaptureInput>,
): Promise<BreakoutCaptureResult> {
  const capture = await capturePostExposureObservation(tx, input);
  return detectCapturedBreakout(tx, input, capture);
}
export async function captureAndDetectNativeSourceExposureObservation(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutNativeCaptureInput>,
): Promise<BreakoutCaptureResult> {
  return detectCapturedBreakout(
    tx,
    input,
    await captureNativeSourceExposureObservation(tx, input),
  );
}
async function detectCapturedBreakout(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutAnyCaptureInput>,
  capture: BreakoutCaptureResult,
): Promise<BreakoutCaptureResult> {
  if (capture.status !== 'captured' && capture.status !== 'replayed')
    return capture;
  if (input.source.isResponse) return capture;
  const metrics = (['views', 'impressions'] as const).filter(
    (metric) =>
      input.exposures[metric]?.availability === 'observed' &&
      input.exposures[metric]?.scope === 'organic',
  );
  if (!metrics.length) return capture;
  const row = await tx.outlierConfiguration.findFirst({
    where: {
      organizationId: input.source.organizationId,
      isDeleted: false,
    },
  });
  const configuration = outlierConfigurationSchema.parse(
    row
      ? {
          windowSize: row.windowSize,
          minimumSampleSize: row.minimumSampleSize,
          outlierThreshold: row.outlierThreshold,
          breakoutThreshold: row.breakoutThreshold,
          maturityHoursByPlatform: row.maturityHoursByPlatform,
        }
      : {},
  );
  const options = collectedBreakoutBaselineOptions(input, configuration);
  if (!options) return capture;
  const nowMs = Date.now();
  for (const metric of metrics) {
    const result = await registerBreakoutResponse(tx, {
      organizationId: input.source.organizationId,
      brandId: input.source.brandId,
      credentialId: input.source.credentialId,
      platform: input.source.platform,
      format: input.source.format,
      targetObservationId: capture.observationId,
      metric,
      options,
      nowMs,
    });
    if (
      result.status !== 'registered' &&
      result.status !== 'replayed' &&
      result.status !== 'evidence_held'
    )
      throw new Error(
        `Breakout detection held: ${result.status}; roll back collection transaction`,
      );
  }
  return capture;
}
