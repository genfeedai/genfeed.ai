import type { MetadataService } from '@api/collections/metadata/services/metadata.service';

/** Preserve the entire provider result before adapter parsing can discard evidence. */
export async function persistImageProviderOutput(
  metadata: MetadataService,
  metadataId: string,
  output: unknown,
  authorizedOutputs: number,
): Promise<void> {
  const supported =
    typeof output === 'string' ||
    (Array.isArray(output) &&
      output.length > 0 &&
      output.every((entry) => typeof entry === 'string'));
  const count =
    typeof output === 'string' ? 1 : Array.isArray(output) ? output.length : 0;
  await metadata.patch(metadataId, {
    result: JSON.stringify(output) ?? 'null',
    ...(!supported || count > authorizedOutputs
      ? {
          error:
            'Provider output does not match the funded dispatch manifest; recovery is required',
        }
      : {}),
  });
}
