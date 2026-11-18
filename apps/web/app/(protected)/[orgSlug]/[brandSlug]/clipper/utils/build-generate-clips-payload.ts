import type {
  BuildGenerateClipsPayloadInput,
  GenerateClipsPayload,
} from '@/props/studio/clipper-api.props';

/**
 * Builds the generate request. Avatar fields apply to avatar mode only, a
 * managed GenfeedAI run sends no IDs, and only a HeyGen run carries a quality
 * (`auto` sends none, so the server picks the default for the look).
 */
export function buildGenerateClipsPayload({
  avatarId,
  avatarProvider,
  avatarQuality,
  editedHighlights,
  mode,
  selectedHighlightIds,
  voiceId,
}: BuildGenerateClipsPayloadInput): GenerateClipsPayload {
  const selected = new Set(selectedHighlightIds);
  const hasQuality =
    avatarProvider === 'heygen' && avatarQuality && avatarQuality !== 'auto';

  return {
    ...(mode === 'avatar'
      ? {
          avatarProvider,
          ...(hasQuality ? { avatarQuality } : {}),
          ...(avatarProvider === 'genfeedai' ? {} : { avatarId, voiceId }),
        }
      : {}),
    editedHighlights: editedHighlights
      .filter((highlight) => selected.has(highlight.id))
      .map((highlight) => ({
        id: highlight.id,
        ...(highlight.script !== undefined ? { script: highlight.script } : {}),
        summary: highlight.summary,
        title: highlight.title,
      })),
    mode,
    selectedHighlightIds,
  };
}
