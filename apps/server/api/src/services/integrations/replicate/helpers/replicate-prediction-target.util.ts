export type ReplicatePredictionTarget = { model: string } | { version: string };

/**
 * Replicate accepts official model slugs through `model`, while immutable
 * version IDs must be sent through `version`. Stored model keys may include
 * both (`owner/model:version`), in which case the immutable version wins.
 */
export function resolvePredictionTarget(
  modelIdentifier: string,
): ReplicatePredictionTarget {
  const versionSeparator = modelIdentifier.lastIndexOf(':');
  if (versionSeparator >= 0) {
    const version = modelIdentifier.slice(versionSeparator + 1);
    if (version.length > 0) {
      return { version };
    }
  }

  return modelIdentifier.includes('/')
    ? { model: modelIdentifier }
    : { version: modelIdentifier };
}
