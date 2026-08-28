import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

/**
 * `draft_brand_voice_profile` costs one generation credit. The API mirrors this
 * value as `BRAND_PROFILE_GENERATION_CREDIT_COST`; the two are pinned together
 * by `agent-tool-registry.spec.ts` because this package cannot import from an app.
 */
export const AGENT_BRAND_PROFILE_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Build one reusable brand profile, including voice, strategy, prompt seeds, and conversation starters, from website/social context, audience, positioning, and examples.',
    name: 'draft_brand_voice_profile',
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
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Save an approved structured brand voice profile to the selected brand agent config.',
    name: 'save_brand_voice_profile',
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
    requiredRole: 'user',
  },
];
