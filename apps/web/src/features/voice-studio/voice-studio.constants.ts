/** Under this, clones sound thin; both providers ask for at least a minute. */
export const VOICE_SAMPLE_MIN_SECONDS = 30;
export const VOICE_SAMPLE_RECOMMENDED_SECONDS = 90;
/** HeyGen uses only the first 3 minutes; recording stops there. */
export const VOICE_SAMPLE_MAX_SECONDS = 180;
/** 24 kHz mono 16-bit: 3 minutes stay under HeyGen's 16 MB inline cap. */
export const VOICE_SAMPLE_RATE = 24_000;
/** Below this RMS level the take is near silence. */
export const VOICE_SAMPLE_MIN_RMS = 0.01;
export const VOICE_SAMPLE_DEFAULT_NAME = 'My voice';
