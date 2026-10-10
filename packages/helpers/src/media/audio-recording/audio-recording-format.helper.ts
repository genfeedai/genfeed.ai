export interface AudioRecordingFormat {
  /** Container MIME type without codec parameters, as sent to the API. */
  blobType: string;
  extension: string;
  /** MIME type to request from MediaRecorder; undefined lets the browser pick. */
  recorderMimeType?: string;
}

/**
 * Preference order for dictation. WebM/Opus is smallest and Chromium/Firefox
 * record it; Safari only records MP4/AAC. Every entry is accepted by the
 * speech transcription endpoint.
 */
const RECORDING_FORMATS: AudioRecordingFormat[] = [
  {
    blobType: 'audio/webm',
    extension: 'webm',
    recorderMimeType: 'audio/webm;codecs=opus',
  },
  { blobType: 'audio/webm', extension: 'webm', recorderMimeType: 'audio/webm' },
  { blobType: 'audio/mp4', extension: 'm4a', recorderMimeType: 'audio/mp4' },
  {
    blobType: 'audio/ogg',
    extension: 'ogg',
    recorderMimeType: 'audio/ogg;codecs=opus',
  },
];

const BLOB_TYPE_EXTENSIONS: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

function isSupportedByRecorder(mimeType: string): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported(mimeType)
  );
}

/** First format this browser's MediaRecorder reports it can record. */
export function pickAudioRecordingFormat(
  isTypeSupported: (mimeType: string) => boolean = isSupportedByRecorder,
): AudioRecordingFormat | undefined {
  return RECORDING_FORMATS.find(
    (format) =>
      format.recorderMimeType !== undefined &&
      isTypeSupported(format.recorderMimeType),
  );
}

/**
 * Describe what a recorder actually produced from its reported `mimeType`
 * (for example `audio/mp4;codecs=mp4a.40.2`), so the upload name and type
 * match the bytes instead of assuming WebM.
 */
export function describeRecordedAudio(
  recorderMimeType: string | undefined,
): AudioRecordingFormat {
  const blobType = (recorderMimeType ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase();
  const extension = blobType ? BLOB_TYPE_EXTENSIONS[blobType] : undefined;

  return extension && blobType
    ? { blobType, extension }
    : { blobType: 'audio/webm', extension: 'webm' };
}
