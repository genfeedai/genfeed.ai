import type { SourceTool } from '../../../interfaces/source-tool.interface';

/**
 * External-agent onboarding (#6268). A user who signs up during the MCP OAuth
 * connect never sees the web onboarding, so their own agent runs it. One
 * parameterized tool keeps the bare MCP URL inside its cap; the MCP server maps
 * each action onto the in-app onboarding agent tools.
 */
export const MCP_ONBOARDING_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Set up a brand inside this conversation. Organization owners and admins can use create_from_url to create a new brand from a website for one credit on success; this queues create_brand_from_url for approval. For an existing brand, scan_url prefills its guide, save_answers stores goals, audience, offer, competitors, platforms, cadence and tone, and complete finishes account onboarding.',
    name: 'onboard_brand',
    parameters: {
      properties: {
        action: {
          description:
            'create_from_url creates a new brand (owners/admins only, one credit on success); scan_url prefills an existing brand; save_answers stores goals, audience, offer, competitors, platforms, cadence and toneAdjustment; complete finishes onboarding.',
          enum: ['create_from_url', 'scan_url', 'save_answers', 'complete'],
          type: 'string',
        },
        brandId: {
          description:
            'Brand to set up, from get_brands. Required for scan_url and save_answers.',
          maxLength: 200,
          minLength: 1,
          type: 'string',
        },
        label: {
          description:
            'create_from_url: brand label; defaults to the website hostname.',
          maxLength: 200,
          minLength: 1,
          type: 'string',
        },
        approve: {
          description:
            'create_from_url: approve the resulting brand guide. This does not approve credit spending.',
          default: false,
          type: 'boolean',
        },
        audience: {
          description: 'save_answers: up to 2 audience segments to write for',
          items: { maxLength: 200, minLength: 1, type: 'string' },
          maxItems: 2,
          type: 'array',
        },
        cadence: {
          description: 'save_answers: how often to post, e.g. "3 posts a week"',
          maxLength: 200,
          minLength: 1,
          type: 'string',
        },
        competitors: {
          description: 'save_answers: up to 3 competitors to position against',
          items: { maxLength: 200, minLength: 1, type: 'string' },
          maxItems: 3,
          type: 'array',
        },
        goals: {
          description: 'save_answers: what the user wants content to achieve',
          items: { maxLength: 200, minLength: 1, type: 'string' },
          maxItems: 10,
          type: 'array',
        },
        offer: {
          description: 'save_answers: the offer content should drive',
          maxLength: 200,
          minLength: 1,
          type: 'string',
        },
        platforms: {
          description: 'save_answers: platforms the user publishes on',
          items: { maxLength: 200, minLength: 1, type: 'string' },
          maxItems: 10,
          type: 'array',
        },
        toneAdjustment: {
          description: 'save_answers: how to adjust the scanned voice',
          maxLength: 200,
          minLength: 1,
          type: 'string',
        },
        url: {
          description: 'create_from_url or scan_url: the public URL to scan',
          maxLength: 2048,
          minLength: 1,
          type: 'string',
        },
      },
      required: ['action'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
