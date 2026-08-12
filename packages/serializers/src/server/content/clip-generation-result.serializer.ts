export interface ClipGenerationResult<TReference> {
  clipCount: number;
  clipResultIds: string[];
  reference?: TReference;
  status: string;
}

export interface ClipGenerationResultInput<TReference> {
  clipCount: number;
  clipResultIds: readonly string[];
  reference?: TReference;
  status: string;
}

/**
 * Serializes the flat response returned after reviewed clip generation starts.
 * The optional reference is already the stable, redacted application contract;
 * provider-readable media URLs never cross this response boundary.
 */
export function serializeClipGenerationResult<TReference>(
  input: ClipGenerationResultInput<TReference>,
): ClipGenerationResult<TReference> {
  return {
    clipCount: input.clipCount,
    clipResultIds: [...input.clipResultIds],
    ...(input.reference === undefined ? {} : { reference: input.reference }),
    status: input.status,
  };
}
