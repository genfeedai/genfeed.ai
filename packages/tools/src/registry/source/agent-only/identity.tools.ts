import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_IDENTITY_TOOLS: SourceTool[] = [
  {
    // Minimum charge per call. Actual amount is billed dynamically by the
    // generation endpoint per avatar video duration (issue #482).
    creditCost: 100,
    description:
      "Generate an avatar video using the user's identity (default avatar photo + cloned voice from org settings). Provide text for the voice to speak. Uses HeyGen photo avatar API. Credits are billed by the avatar video generation endpoint.",
    name: 'generate_as_identity',
    parameters: {
      properties: {
        text: {
          description: 'The text for the avatar to speak',
          type: 'string',
        },
      },
      required: ['text'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
];
