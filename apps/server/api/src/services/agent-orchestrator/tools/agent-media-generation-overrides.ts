/**
 * The per-generation overrides an agent tool call may carry to the media
 * endpoints: an explicit prompt-enhancement switch and the user's explicit
 * "generate without brand" choice. Anything else (including any other
 * `brandMode`) is dropped so the server alone decides approved and provisional
 * brand modes.
 */
export function pickMediaGenerationOverrides(params: Record<string, unknown>): {
  brandMode?: 'raw';
  harness?: boolean;
} {
  return {
    ...(typeof params.harness === 'boolean' ? { harness: params.harness } : {}),
    ...(params.brandMode === 'raw' ? { brandMode: 'raw' as const } : {}),
  };
}
