import { GENERATE_CONTENT_TEXT_CREDITS } from '@genfeedai/contracts/constants/tool-credit.constant';
import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_CONTENT_TOOLS: SourceTool[] = [
  {
    name: 'link_external_publication_credential',
    description:
      'Link an already recorded own publication to its matching connected account for analytics. This never publishes or schedules content.',
    creditCost: 0,
    requiredRole: 'user',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['brandId', 'postId', 'credentialId'],
      properties: {
        brandId: { type: 'string', minLength: 1 },
        postId: { type: 'string', minLength: 1 },
        credentialId: { type: 'string', minLength: 1 },
      },
    },
  },
  {
    name: 'record_external_publication',
    description:
      'Record a user’s reported already successful own publication. This never publishes, schedules or verifies provider success. Supply either its true publication permalink in url, or for a reply only its observed externalId and parent contextUrl with url omitted.',
    creditCost: 0,
    requiredRole: 'user',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: [
        'brandId',
        'platform',
        'publicationKind',
        'description',
        'publicationDate',
      ],
      properties: {
        brandId: { type: 'string', minLength: 1 },
        platform: {
          type: 'string',
          enum: [
            'twitter',
            'linkedin',
            'reddit',
            'youtube',
            'instagram',
            'facebook',
            'tiktok',
          ],
        },
        publicationKind: { type: 'string', enum: ['post', 'reply'] },
        observedVisibility: {
          type: 'string',
          enum: ['public', 'private', 'unlisted', 'unknown'],
          description:
            'Reported provider audience evidence; omit or use unknown when unavailable. Never infer public from a permalink.',
        },
        url: { type: 'string', minLength: 1, maxLength: 2048 },
        contextUrl: { type: 'string', minLength: 1, maxLength: 2048 },
        externalId: { type: 'string', minLength: 1, maxLength: 256 },
        description: {
          type: 'string',
          maxLength: 1048576,
          description:
            'Complete reported publication text, at most 1048576 UTF-8 bytes. Never truncated.',
        },
        publicationDate: {
          type: 'string',
          format: 'date-time',
          description:
            'Strict ISO datetime of the observed publication; at most five minutes in the future.',
        },
        author: {
          type: 'object',
          additionalProperties: false,
          properties: {
            externalId: { type: 'string', minLength: 1, maxLength: 256 },
            handle: { type: 'string', minLength: 1, maxLength: 256 },
          },
        },
      },
    },
  },
  {
    creditCost: GENERATE_CONTENT_TEXT_CREDITS,
    description:
      'Generate content for a topic or brief. Social types (caption, post, thread, script, article_outline) return ready-to-publish text with hook, body, CTA and hashtags and are not saved; use platform linkedin for LinkedIn posts and variationsCount for alternatives. type newsletter creates a saved newsletter draft. type article (or x-article) generates and saves an article draft with an id, ready for get_article_preview and publish_article; to import an already written article without regeneration use create_article_draft. Each field lists the types it applies to.',
    name: 'generate_content',
    parameters: {
      properties: {
        brandId: {
          description: 'All types. Brand ID to use for tone and voice',
          type: 'string',
        },
        knowledgePurposes: {
          description:
            'Social types. Restrict grounding to saved Knowledge with these purposes (BRAND_TRUTH, INSPIRATION, RESEARCH)',
          items: {
            enum: ['BRAND_TRUTH', 'INSPIRATION', 'RESEARCH'],
            type: 'string',
          },
          type: 'array',
        },
        knowledgeSourceIds: {
          description:
            'Social types. Ground the content on these saved Knowledge source ids only; the output cites them',
          items: { type: 'string' },
          type: 'array',
        },
        keywords: {
          description: 'article, x-article. SEO keywords to include',
          items: { type: 'string' },
          type: 'array',
        },
        length: {
          description:
            'article. Article length, folded into the generation prompt',
          enum: ['short', 'medium', 'long'],
          type: 'string',
        },
        platform: {
          description: 'Social types. Target social platform',
          enum: [
            'instagram',
            'twitter',
            'linkedin',
            'tiktok',
            'youtube',
            'facebook',
            'newsletter',
          ],
          type: 'string',
        },
        targetAudience: {
          description:
            'article. Target audience, folded into the generation prompt',
          type: 'string',
        },
        tone: {
          description:
            'article, x-article. Writing tone, for example professional, casual, humorous, technical or storytelling',
          type: 'string',
        },
        topic: {
          description:
            'All types. Topic or brief for the content (at most 500 characters for article and x-article)',
          type: 'string',
        },
        type: {
          description: 'Type of content to generate',
          enum: [
            'caption',
            'post',
            'article_outline',
            'thread',
            'script',
            'newsletter',
            'article',
            'x-article',
          ],
          type: 'string',
        },
        variationsCount: {
          description:
            'Social types. Number of variations to generate (1-5, default 1)',
          maximum: 5,
          minimum: 1,
          type: 'number',
        },
      },
      required: ['topic', 'type'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 1,
    description:
      'Schedule an existing draft post for a specific date and time.',
    name: 'schedule_post',
    parameters: {
      properties: {
        postId: {
          description: 'ID of the post to schedule',
          type: 'string',
        },
        scheduledAt: {
          description: 'ISO 8601 datetime string for when to publish',
          type: 'string',
        },
      },
      required: ['postId', 'scheduledAt'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 5,
    description:
      'Generate a full month of content (30 days) for a brand. Creates a content plan with a mix of tweets, images, and videos, then executes it. Requires credits.',
    name: 'generate_monthly_content',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to generate content for',
          type: 'string',
        },
        platforms: {
          description: 'Target platforms for content',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['brandId', 'platforms'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Spawn a specialized sub-agent to create a specific type of content. Use for video, image, article, or tweet/thread creation. The sub-agent inherits brand context and applies platform-specific expertise and tools. Sub-agent charges its own credits for content it generates.',
    name: 'spawn_content_agent',
    parameters: {
      properties: {
        agentType: {
          description:
            'Type of content specialist to spawn. x_content for tweets/threads, image_creator for images/carousels, video_creator for short-form video, ai_avatar for AI avatar videos, article_writer for long-form articles/blog posts.',
          enum: [
            'x_content',
            'image_creator',
            'video_creator',
            'ai_avatar',
            'article_writer',
          ],
          type: 'string',
        },
        credentialId: {
          description:
            'Target social account credential ID. Provides the sub-agent with account-specific context (handle, platform, audience).',
          type: 'string',
        },
        task: {
          description:
            'Detailed content brief for the sub-agent. Include topic, tone, format, and any specific requirements.',
          type: 'string',
        },
      },
      required: ['agentType', 'task'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Rate content quality from 1-10 and return actionable feedback and improvement suggestions.',
    name: 'rate_content',
    parameters: {
      properties: {
        contentId: {
          description: 'ID of the content item to rate',
          type: 'string',
        },
        contentType: {
          description: 'Type of content to rate',
          enum: ['image', 'video', 'post'],
          type: 'string',
        },
        context: {
          description:
            'Optional context for scoring criteria, campaign goals, or audience',
          type: 'string',
        },
      },
      required: ['contentId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Score a piece of content (article or post) for SEO against a 7-dimension rubric. Returns a 0-100 score, per-dimension breakdown, and prioritized improvement suggestions. Persists the result on the entity.',
    name: 'score_seo',
    parameters: {
      properties: {
        contentId: {
          description: 'ID of the article or post to score',
          type: 'string',
        },
        contentType: {
          description: 'Type of content to score (defaults to article)',
          enum: ['article', 'post'],
          type: 'string',
        },
        targetKeyword: {
          description:
            'Optional primary keyword to audit placement against (title, slug, meta, headings, density)',
          type: 'string',
        },
      },
      required: ['contentId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
