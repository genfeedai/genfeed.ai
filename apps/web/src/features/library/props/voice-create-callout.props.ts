export interface VoiceCreateCalloutProps {
  /** Where the organization connects its own provider accounts. */
  connectHref: string;
  /** The digital twin page: an avatar and a voice from one recording. */
  twinHref: string;
  onCloneVoice: () => void;
}
