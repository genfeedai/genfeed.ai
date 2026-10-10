import type { Prisma } from '@genfeedai/prisma';

/** File callbacks cannot replace or fabricate accepted or server-measured quantities. */
export function mergeWorkflowProviderResult(
  stored: unknown,
  callback: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  if (callback === undefined) return undefined;
  const {
    acceptedFalOutput: _untrusted,
    measuredFalOutput: _untrustedMeasurement,
    falOutputIngestion: _untrustedLease,
    ...result
  } = callback;
  const original =
    stored !== null && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  return {
    ...result,
    ...(original.falOutputIngestion === undefined
      ? {}
      : { falOutputIngestion: original.falOutputIngestion }),
    ...(original.acceptedFalOutput === undefined
      ? {}
      : { acceptedFalOutput: original.acceptedFalOutput }),
    ...(original.measuredFalOutput === undefined
      ? {}
      : { measuredFalOutput: original.measuredFalOutput }),
  } as Prisma.InputJsonValue;
}
