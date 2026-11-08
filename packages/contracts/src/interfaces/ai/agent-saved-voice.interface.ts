/** A personal voice the organization saved, as `get_assets type=voice` lists it. */
export interface AgentSavedVoice {
  externalVoiceId: string | null;
  id: string;
  /** Whether this voice is the brand default for avatar videos and speech. */
  isBrandDefault: boolean;
  name: string;
  previewUrl: string | null;
  provider: string | null;
  source: 'cloned' | 'imported';
}
