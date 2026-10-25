export interface ClipperGenerationResult<TReference> {
  clipCount: number;
  clipperResultIds: string[];
  reference?: TReference;
  status: string;
}

export interface ClipperGenerationResultInput<TReference> {
  clipCount: number;
  clipperResultIds: readonly string[];
  reference?: TReference;
  status: string;
}

/**
 * Serializes the flat response returned after reviewed clip generation starts.
 * The optional reference is already the stable, redacted application contract;
 * provider-readable media URLs never cross this response boundary.
 */
export function serializeClipperGenerationResult<TReference>(
  input: ClipperGenerationResultInput<TReference>,
): ClipperGenerationResult<TReference> {
  return {
    clipCount: input.clipCount,
    clipperResultIds: [...input.clipperResultIds],
    ...(input.reference === undefined ? {} : { reference: input.reference }),
    status: input.status,
  };
}
