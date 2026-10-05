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
      'Set up a new account brand inside this conversation. Use it when get_account reports profile.isOnboardingCompleted false, before generating anything. Steps: (1) scan_url with one public URL the user gives (website, social profile, link page or product page) to prefill name, description, voice, colors and logo; if the scan fails, ask for another URL. (2) Ask the user, one question at a time, for goals, platforms, posting cadence and any tone adjustment, then save_answers. (3) complete once the user confirms the brand.',
    name: 'onboard_brand',
    parameters: {
      properties: {
        action: {
          description:
            'scan_url prefills the brand from url; save_answers stores goals, platforms, cadence and toneAdjustment; complete finishes onboarding.',
          enum: ['scan_url', 'save_answers', 'complete'],
          type: 'string',
        },
        brandId: {
          description:
            'Brand to set up, from get_brands. Required for scan_url and save_answers.',
          maxLength: 200,
          minLength: 1,
          type: 'string',
        },
        cadence: {
          description: 'save_answers: how often to post, e.g. "3 posts a week"',
          maxLength: 200,
          minLength: 1,
          type: 'string',
        },
        goals: {
          description: 'save_answers: what the user wants content to achieve',
          items: { maxLength: 200, minLength: 1, type: 'string' },
          maxItems: 10,
          type: 'array',
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
          description: 'scan_url: the public URL to scan',
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
