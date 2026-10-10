export interface HeyGenSpeechInput {
  /** Instant voices only; HeyGen rejects it for a professional clone. */
  expressivenessBoost?: number;
  language?: string;
  text: string;
  /** An ACTIVE HeyGen Voice clone in the API key's workspace. */
  voiceId: string;
}

export interface HeyGenSpeechBody {
  expressiveness_boost?: number;
  language?: string;
  model: 'heygen-voice-1';
  text: string;
  voice_id: string;
}

export interface HeyGenSpeechResult {
  audioUrl: string;
  /** The submitted characters HeyGen bills, counted as Unicode code points. */
  characters: number;
  /** Seconds, when HeyGen reports one. */
  duration?: number;
}
