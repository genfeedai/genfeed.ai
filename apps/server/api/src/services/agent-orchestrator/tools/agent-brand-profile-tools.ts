import { BRAND_PROFILE_GENERATION_CREDIT_COST } from '@api/collections/brands/constants/brand-profile.constant';
import type { AgentToolDefinition } from '@genfeedai/interfaces';
import { AgentToolName } from '@genfeedai/interfaces';

export const AGENT_BRAND_PROFILE_TOOLS: AgentToolDefinition[] = [
  {
    creditCost: BRAND_PROFILE_GENERATION_CREDIT_COST,
    description:
      'Build one reusable brand profile, including voice, strategy, prompt seeds, and conversation starters, from website/social context, audience, positioning, and examples.',
    name: AgentToolName.DRAFT_BRAND_VOICE_PROFILE,
    parameters: {
      properties: {
        brandId: {
          description:
            'Optional target brand ID. Uses the active brand if omitted.',
          type: 'string',
        },
        examplesToAvoid: {
          description:
            'Examples, tones, or creators the brand does not want to sound like.',
          items: { type: 'string' },
          type: 'array',
        },
        examplesToEmulate: {
          description:
            'Examples, tones, or creators the brand wants to emulate.',
          items: { type: 'string' },
          type: 'array',
        },
        industry: {
          description: 'The brand industry or market category.',
          type: 'string',
        },
        offering: {
          description: 'What the brand sells, creates, or helps with.',
          type: 'string',
        },
        targetAudience: {
          description: 'Who the brand is trying to reach.',
          type: 'string',
        },
        url: {
          description: 'Website, LinkedIn company page, or X profile URL.',
          type: 'string',
        },
      },
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Save an approved structured brand voice profile to the selected brand agent config.',
    name: AgentToolName.SAVE_BRAND_VOICE_PROFILE,
    parameters: {
      properties: {
        brandId: {
          description: 'Target brand ID. Uses the active brand if omitted.',
          type: 'string',
        },
        voiceProfile: {
          description: 'Approved brand voice profile to save.',
          type: 'object',
        },
      },
      required: ['voiceProfile'],
      type: 'object',
    },
  },
];
