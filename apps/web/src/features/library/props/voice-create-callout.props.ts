export interface VoiceCreateCalloutProps {
  /** Where the organization connects its own provider accounts. */
  connectHref: string;
  /** The page that records a sample and clones it. */
  recordHref: string;
  /** The digital twin page: an avatar and a voice from one recording. */
  twinHref: string;
  /** Clone from an existing audio file (ElevenLabs only). */
  onUploadSample: () => void;
}
