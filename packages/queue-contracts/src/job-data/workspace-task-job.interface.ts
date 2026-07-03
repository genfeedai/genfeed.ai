export interface WorkspaceTaskJobData {
  /** Workspace task document ID */
  taskId: string;
  /** Organization context (multi-tenancy) */
  organizationId: string;
  /** User who created the task */
  userId: string;
  /** Raw user request */
  request: string;
  /** Output type hint */
  outputType?: string;
  /** Target platforms */
  platforms?: string[];
  /** Brand ID */
  brandId?: string;
  /** Brand name for context */
  brandName?: string;
  /** HeyGen avatar ID (facecam tasks only) */
  heygenAvatarId?: string;
  /** Provider-agnostic voice ID (facecam tasks) — can be a HeyGen catalog ID, ElevenLabs ID, or Voice document _id */
  voiceId?: string;
  /** Voice provider hint — determines how voiceId is resolved (heygen | elevenlabs | genfeed-ai | hedra) */
  voiceProvider?: string;
  /** Explicit ElevenLabs voice ID (facecam tasks) when caller pins the ElevenLabs provider directly */
  elevenlabsVoiceId?: string;
}
