import type { AvatarTwinStatus } from '../../enums/avatar-twin.enum';

/**
 * A digital twin the caller recorded of themselves, as the Agent and the MCP
 * see it (`get_assets type=digital_twin`, `transform_media digital_twin`).
 * Status comes from what HeyGen last reported, never from a guess.
 */
export interface AgentDigitalTwin {
  id: string;
  name: string;
  status: AvatarTwinStatus;
  /** HeyGen's consent state for the person on camera. */
  consent: 'pending' | 'accepted' | 'rejected' | null;
  /** When the last consent link stops working; null before one is issued. */
  consentLinkExpiresAt: string | null;
  failure: { code: string | null; message: string | null } | null;
  previewImageUrl: string | null;
  /** The HeyGen voice cloned from the footage. */
  voiceId: string | null;
  /** Whether this twin is the brand's default avatar. */
  isBrandDefault: boolean;
  readyAt: string | null;
  createdAt: string;
  /** What the person has to do next, in plain words. */
  nextStep: string;
  /** Set when HeyGen could not be reached; the status is the last one stored. */
  statusCheckError?: string;
}

/** A consent page on HeyGen's site for the person on camera. */
export interface AgentDigitalTwinConsentLink {
  consentUrl: string;
  expiresAt: string;
}
