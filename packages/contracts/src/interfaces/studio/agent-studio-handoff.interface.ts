import type { HeyGenAvatarRef } from '../integrations/heygen.interface';
import type { IBrandAgentConfig } from '../organization/brand.interface';
import type { StudioPlaygroundType } from './studio-playground.interface';

/**
 * #4670 Agent → Studio handoff. Carries the prompt and parameters the Agent
 * already resolved (never "auto" for `modelKey` — the concrete model the
 * router picked) so Studio generate can open pre-filled for precise editing
 * without spending credits or re-prompting.
 *
 * Identity (`avatarPhotoUrl`, `voiceId`) is snapshotted at create time from
 * the brand's current identity (#4717), never re-resolved at consume.
 */
export interface AgentStudioHandoffPayload {
  requestedSkillSlugs?: string[];
  harness?: boolean;
  aspectRatio?: string;
  /** Public URL of the brand identity's portrait, for an avatar handoff. */
  avatarPhotoUrl?: string;
  avatarRef?: HeyGenAvatarRef;
  voiceRef?: NonNullable<IBrandAgentConfig['defaultVoiceRef']>;
  brandId: string;
  duration?: number;
  /** Concrete model key the router resolved — never the literal `"auto"`. */
  modelKey: string;
  outputs?: number;
  prompt: string;
  /** Asset/ingredient ids used as generation references. */
  references?: string[];
  resolution?: string;
  type: StudioPlaygroundType;
  /**
   * True when the source generation used the brand identity. Studio uses this
   * (with `type`) to notice an omitted avatar/voice rather than looking like
   * the operator chose Studio's defaults on purpose.
   */
  useIdentity?: boolean;
  /** Provider voice id, for an avatar or voice handoff. */
  voiceId?: string;
}

/** Server-authoritative identity of who created a handoff — never trusted
 * from a client-supplied field; always derived from the authenticated
 * request on both create and consume. */
export interface AgentStudioHandoffScope {
  organizationId: string;
  userId: string;
}

export interface AgentStudioHandoffCreated {
  id: string;
}
