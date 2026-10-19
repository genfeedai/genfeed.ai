import type { SourceTool } from '../../../interfaces/source-tool.interface';

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
        aspectRatio: {
          description:
            'Explicit output format. Overrides the platform default: 9:16 portrait, 16:9 landscape, 1:1 square.',
          enum: ['9:16', '16:9', '1:1'],
          type: 'string',
        },
        platform: {
          description:
            'Where the video will be posted (for example tiktok, instagram reels, youtube shorts, twitter). Picks the format when aspectRatio is not set; defaults to portrait.',
          type: 'string',
        },
        text: {
          description: 'The text for the avatar to speak',
          type: 'string',
        },
      },
      required: ['text'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
