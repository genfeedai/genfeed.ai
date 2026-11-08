import {
  VOICE_SAMPLE_MAX_SECONDS,
  VOICE_SAMPLE_MIN_RMS,
  VOICE_SAMPLE_RATE,
} from '@/features/voice-studio/voice-studio.constants';

export interface PreparedVoiceSample {
  durationSeconds: number;
  file: File;
  isTooQuiet: boolean;
}

/** 16-bit PCM mono WAV: lossless, and accepted by every clone provider. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1)
      view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      44 + index * bytesPerSample,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true,
    );
  });
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Root-mean-square level, 0 for silence and about 0.05–0.2 for speech. */
export function rmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

/**
 * Turns a browser recording (webm or m4a) into a mono 24 kHz WAV, cut at
 * the 3 minutes the provider uses, and says whether it is near silence.
 */
export async function prepareVoiceSample(
  recording: Blob,
  fileName: string,
): Promise<PreparedVoiceSample> {
  const decoded = await decodeAudio(await recording.arrayBuffer());
  const durationSeconds = Math.min(decoded.duration, VOICE_SAMPLE_MAX_SECONDS);
  const frames = Math.max(1, Math.ceil(durationSeconds * VOICE_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frames, VOICE_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  return {
    durationSeconds,
    file: new File([encodeWav(samples, VOICE_SAMPLE_RATE)], fileName, {
      type: 'audio/wav',
    }),
    isTooQuiet: rmsLevel(samples) < VOICE_SAMPLE_MIN_RMS,
  };
}

async function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(data);
  } finally {
    void context.close();
  }
}
