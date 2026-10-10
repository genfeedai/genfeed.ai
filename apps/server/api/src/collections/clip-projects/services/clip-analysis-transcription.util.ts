import type { WhisperService } from '@api/services/whisper/whisper.service';

export type ClipAnalysisTranscription = Awaited<
  ReturnType<WhisperService['transcribeUrl']>
>;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function readSavedClipTranscription(
  value: unknown,
  sourceFingerprint: string,
  requestedLanguage: string,
): ClipAnalysisTranscription | undefined {
  const checkpoint = record(value);
  if (
    !checkpoint ||
    !sourceFingerprint ||
    checkpoint.sourceFingerprint !== sourceFingerprint ||
    checkpoint.requestedLanguage !== requestedLanguage
  ) {
    return undefined;
  }
  const transcription = record(checkpoint.transcription);
  if (
    !transcription ||
    typeof transcription.text !== 'string' ||
    typeof transcription.srt !== 'string' ||
    typeof transcription.language !== 'string' ||
    !finiteNonnegative(transcription.duration) ||
    !Array.isArray(transcription.segments)
  ) {
    return undefined;
  }
  for (const value of transcription.segments) {
    const segment = record(value);
    if (
      !segment ||
      typeof segment.text !== 'string' ||
      !finiteNonnegative(segment.start) ||
      !finiteNonnegative(segment.end) ||
      segment.end < segment.start
    ) {
      return undefined;
    }
    if (segment.words !== undefined) {
      if (!Array.isArray(segment.words)) return undefined;
      for (const value of segment.words) {
        const word = record(value);
        if (
          !word ||
          typeof word.word !== 'string' ||
          !finiteNonnegative(word.start) ||
          !finiteNonnegative(word.end) ||
          word.end < word.start
        ) {
          return undefined;
        }
      }
    }
  }
  return {
    duration: transcription.duration,
    language: transcription.language,
    segments: transcription.segments as ClipAnalysisTranscription['segments'],
    srt: transcription.srt,
    text: transcription.text,
  };
}
