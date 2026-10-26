import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_IDENTITY_TOOLS: SourceTool[] = [
  {
    // Minimum charge per call. Actual amount is billed dynamically by the
    // generation endpoint per avatar video duration (issue #482).
    creditCost: 100,
    description:
      "Generate an avatar video using the user's identity (default avatar photo + cloned voice from org settings). Provide topic to have Genfeed write the script in the brand voice, or text only for words the user wrote themselves; text is spoken verbatim. Uses HeyGen photo avatar API. Credits are billed by the avatar video generation endpoint.",
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
          description:
            'Words the user wrote for the avatar to speak. Spoken verbatim; do not draft a script yourself, pass topic instead.',
          type: 'string',
        },
        topic: {
          description:
            'What the video is about. Genfeed writes the spoken script from the brand brief. Use this when the user did not supply the words.',
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
