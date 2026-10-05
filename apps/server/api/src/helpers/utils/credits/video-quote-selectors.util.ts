/**
 * The price selectors a video request supplies to the quote. Admission and the
 * Studio estimate both build them here so audio and resolution can never
 * diverge between what is shown and what is charged.
 */
export function buildVideoQuoteSelectors(input: {
  isAudioEnabled?: boolean;
  resolution?: string;
}): Record<string, string | boolean> {
  return {
    ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
    ...(input.isAudioEnabled !== undefined
      ? { audio: input.isAudioEnabled, generate_audio: input.isAudioEnabled }
      : {}),
  };
}
