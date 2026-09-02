import { AgentType } from '@genfeedai/contracts';

/**
 * Default deterministic content workflow template per agent type.
 *
 * Templates live in `WORKFLOW_TEMPLATES` (generation + productized). Agents
 * only fill inputVariables (topic/prompt/assets); the graph stays fixed.
 *
 * Keys are seeded-template ids (`sourceType: 'seeded-template'`), not system
 * catalog canonical ids — generation templates are installable via
 * `POST /workflows { templateId }`.
 */
export interface AgentTypeWorkflowDefault {
  /** Human-facing reason this graph fits the role. */
  description: string;
  /** Default skill path when no workflow is bound (autopilot fallback). */
  skillSlugs: string[];
  /** `WORKFLOW_TEMPLATES` id. */
  templateId: string;
}

export const AGENT_TYPE_WORKFLOW_DEFAULTS: Partial<
  Record<AgentType, AgentTypeWorkflowDefault>
> = {
  [AgentType.GENERAL]: {
    description:
      'General content agent — founder-style short post graph as a safe default.',
    skillSlugs: ['content-writing'],
    templateId: 'founder-x-post',
  },
  [AgentType.X_CONTENT]: {
    description: 'Founder-style X post from topic, angle, and optional CTA.',
    skillSlugs: ['content-writing'],
    templateId: 'founder-x-post',
  },
  [AgentType.IMAGE_CREATOR]: {
    description: 'Editorial illustration from visual angle and brand cues.',
    skillSlugs: ['image-generation'],
    templateId: 'founder-editorial-illustration',
  },
  [AgentType.VIDEO_CREATOR]: {
    description: 'Short-form social video series from a prompt.',
    skillSlugs: ['content-writing', 'image-generation'],
    templateId: 'social-media-video-series',
  },
  [AgentType.AI_AVATAR]: {
    description: 'Talking-head avatar video from a script (+ optional photo).',
    skillSlugs: ['content-writing'],
    templateId: 'avatar-ugc-heygen',
  },
  [AgentType.ARTICLE_WRITER]: {
    description: 'Long-form newsletter/article from topic and takeaway.',
    skillSlugs: ['content-writing'],
    templateId: 'founder-newsletter',
  },
  [AgentType.LINKEDIN_CONTENT]: {
    description: 'Long-form professional post via newsletter-style graph.',
    skillSlugs: ['content-writing'],
    templateId: 'founder-newsletter',
  },
  [AgentType.ADS_SCRIPT_WRITER]: {
    description: 'Hook-led short copy graph for ad scripts.',
    skillSlugs: ['content-writing'],
    templateId: 'founder-x-post',
  },
  [AgentType.SHORT_FORM_WRITER]: {
    description: 'TikTok/IG slideshow automation from hooks and captions.',
    skillSlugs: ['content-writing'],
    templateId: 'tiktok-slideshow-automation',
  },
  [AgentType.CTA_CONTENT]: {
    description: 'Conversion-focused short post graph.',
    skillSlugs: ['content-writing'],
    templateId: 'founder-x-post',
  },
  [AgentType.YOUTUBE_SCRIPT]: {
    description: 'YouTube title, thumbnail variants, and script.',
    skillSlugs: ['content-writing', 'image-generation'],
    templateId: 'youtube-thumbnail-script',
  },
  [AgentType.BRAND_INTERVIEW]: {
    description: 'Brand interview notes → long-form newsletter/article graph.',
    skillSlugs: ['content-writing'],
    templateId: 'founder-newsletter',
  },
};

export function getAgentTypeWorkflowDefault(
  agentType: string | undefined | null,
): AgentTypeWorkflowDefault | null {
  if (!agentType) {
    return null;
  }

  return (
    AGENT_TYPE_WORKFLOW_DEFAULTS[agentType as AgentType] ??
    AGENT_TYPE_WORKFLOW_DEFAULTS[AgentType.GENERAL] ??
    null
  );
}
