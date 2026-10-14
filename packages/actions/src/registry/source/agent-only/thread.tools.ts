import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_THREAD_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Propose reply posts that turn an existing X post into a thread, written in the brand voice. Nothing is added to the thread: the proposed posts appear as a reviewable preview with a brand receipt (receiptId), and the exact text is kept on that receipt. Only for an X post with no replies yet. After the user accepts, call add_thread_posts with the posts they want.',
    name: 'draft_thread',
    parameters: {
      additionalProperties: false,
      properties: {
        count: {
          description:
            'Total posts in the thread including the original (2-5). The tool proposes count - 1 replies.',
          maximum: 5,
          minimum: 2,
          type: 'integer',
        },
        postId: {
          description: 'The X post that starts the thread.',
          minLength: 1,
          type: 'string',
        },
        tone: {
          description: 'Tone of the proposed replies (default professional).',
          enum: ['professional', 'casual', 'viral', 'educational', 'humorous'],
          type: 'string',
        },
      },
      required: ['postId', 'count'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Save accepted reply posts, in order, under an X post as drafts. Requires approval. A closing @grok post stays last. Call it only with posts the user accepted, and pass only the posts that are not saved yet when retrying a partial failure.',
    name: 'add_thread_posts',
    parameters: {
      additionalProperties: false,
      properties: {
        grokQuestion: {
          description:
            'Optional closing question for @grok (for example "@grok is this accurate?"). It is saved as the last post of the thread.',
          maxLength: 400,
          type: 'string',
        },
        postId: {
          description: 'The X post that starts the thread.',
          minLength: 1,
          type: 'string',
        },
        posts: {
          description:
            'Reply texts to save in order. Each must fit 280 weighted characters and must not start with @grok.',
          items: { maxLength: 1000, minLength: 1, type: 'string' },
          maxItems: 10,
          minItems: 1,
          type: 'array',
        },
      },
      required: ['postId', 'posts'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Save a first comment under a YouTube, Instagram, LinkedIn, Facebook or Reddit post as a draft. Requires approval. The post may have only one first comment. For X use draft_thread and add_thread_posts instead.',
    name: 'add_first_comment',
    parameters: {
      additionalProperties: false,
      properties: {
        comment: {
          description: 'The first comment text.',
          maxLength: 2000,
          minLength: 1,
          type: 'string',
        },
        postId: {
          description: 'The post that receives the first comment.',
          minLength: 1,
          type: 'string',
        },
      },
      required: ['postId', 'comment'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
