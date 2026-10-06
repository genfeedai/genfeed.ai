import type { SourceTool } from '../../interfaces/source-tool.interface';
import {
  MEDIA_GENERATION_CREDIT_FLOORS,
  MEDIA_GENERATION_TYPES,
} from '../media-generation';
import { OVERLAP_GENERATION_TOOLS } from './overlap-generation.tools';
import { OVERLAP_KNOWLEDGE_TOOLS } from './overlap-knowledge.tools';
import { OVERLAP_PUBLISHING_TOOLS } from './overlap-publishing.tools';
import { OVERLAP_QUERY_TOOLS } from './overlap-query.tools';
import { OVERLAP_WORKFLOW_TOOLS } from './overlap-workflow.tools';
import { PUBLISH_TARGET_SCHEMA } from './schemas/publish-target.schema';
import { WORKFLOW_CONTROL_TOOLS } from './workflow-control.tools';

export const OVERLAP_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Create a post draft from text, or prepare direct publishing for an existing content item or ingredient. The in-app agent returns a publish confirmation card first and publishes only after confirmed is set. On MCP this never publishes: confirmed is rejected, and publishing uses create_scheduled_release.',
    name: 'create_post',
    parameters: {
      properties: {
        caption: {
          description: 'Caption override for the content item.',
          type: 'string',
        },
        sourceActionId: {
          description:
            'Persisted confirmation token; authorization is verified against the trusted execution context.',
          type: 'string',
        },
        confirmed: {
          description:
            'Rejected on MCP. Do not set it. Publish with create_scheduled_release. The in-app agent sets it only after the publish confirmation card.',
          type: 'boolean',
        },
        content: {
          description: 'Draft text for a standalone post.',
          type: 'string',
        },
        contentId: {
          description: 'Content or ingredient ID to publish directly.',
          type: 'string',
        },
        ingredientId: {
          description: 'Ingredient ID to publish directly.',
          type: 'string',
        },
        mediaUrls: {
          description: 'Media URLs for a standalone draft post.',
          items: { type: 'string' },
          type: 'array',
        },
        platform: {
          description: 'Legacy single-platform hint.',
          type: 'string',
        },
        platforms: {
          description: 'Platforms to publish the content item to.',
          items: {
            type: 'string',
          },
          type: 'array',
        },
        postingSetId: {
          type: 'string',
          description: 'Selected posting set ID.',
        },
        timezone: {
          type: 'string',
          description: 'Timezone used for scheduling.',
        },
        targets: {
          type: 'array',
          items: PUBLISH_TARGET_SCHEMA,
          description:
            'Per-account publish or schedule settings from the confirmation card.',
        },
        scheduledAt: {
          description:
            'ISO datetime to schedule instead of publishing immediately.',
          type: 'string',
        },
        textContent: {
          description: 'Text or caption for the confirmation card.',
          type: 'string',
        },
        visibility: {
          description: 'Audience visibility, independent of publish lifecycle.',
          enum: ['public', 'private', 'unlisted'],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  ...OVERLAP_WORKFLOW_TOOLS,
  {
    // Minimum charge across types (music). The per-type floor gates
    // affordability (`MEDIA_GENERATION_CREDIT_FLOORS`); the generation
    // endpoint bills the real amount (issue #482).
    creditCost: Math.min(...Object.values(MEDIA_GENERATION_CREDIT_FLOORS)),
    description:
      'Generate an image, video, voice (text-to-speech) or music track. Set type; a parameter marked for another type is rejected. For model, pass a key from get_generation_options models, or omit it so the router picks. Image and video results include generationHarness with the exact submitted prompt and enhancement status: show that prompt with the result instead of reconstructing it. The advertised range is the per-type floor; the endpoint bills the selected model amount, which is at least that floor.',
    name: 'generate',
    parameters: {
      properties: {
        type: {
          description: 'Asset to generate.',
          enum: [...MEDIA_GENERATION_TYPES],
          type: 'string',
        },
        prompt: {
          description:
            'What to generate. For voice, the exact text to speak. For music, the style, mood, instruments and genre.',
          type: 'string',
        },
        model: {
          description:
            'Image, video or music only. Exact models[].key from get_generation_options for that type. Omit for the router. Do not invent aliases; an unknown key is rejected.',
          type: 'string',
        },
        brandId: {
          description:
            'Brand that owns this generation. Required when the organization has more than one brand.',
          type: 'string',
        },
        aspectRatio: {
          description: 'Image or video only. For example 1:1, 16:9 or 9:16.',
          type: 'string',
        },
        resolution: {
          description:
            'Image or video only. Use a resolution the chosen model accepts. black-forest-labs/flux-3-image accepts 768sq, 1k (default), 1.5k, 2k or 4k. Video values are model-native, for example 720p, 1080p or 4k; unsupported values are rejected.',
          type: 'string',
        },
        duration: {
          description:
            'Video or music only. Seconds; video models clamp or reject out-of-range values, music accepts 10-300.',
          type: 'number',
        },
        outputs: {
          description: 'Image only. Number of variants.',
          maximum: 8,
          minimum: 1,
          type: 'integer',
        },
        references: {
          description:
            'Image or video only. Asset/ingredient ids or URLs used as character or style references, not the start frame. Max 10 for images, 8 for video.',
          items: { type: 'string' },
          maxItems: 10,
          type: 'array',
        },
        characterHandles: {
          description:
            'Image or video only. Brand character handles resolved into reference images. Max 4; unresolvable handles fail the call.',
          items: { type: 'string' },
          maxItems: 4,
          type: 'array',
        },
        imageUrl: {
          description:
            'Video only. Start-frame image URL for image-to-video; with audioUrl, talking-avatar lip-sync.',
          type: 'string',
        },
        audioUrl: {
          description:
            'Video only. Audio URL for avatar lip-sync together with imageUrl.',
          type: 'string',
        },
        endFrame: {
          description: 'Video only. Image ingredient id for the final frame.',
          type: 'string',
        },
        videoReferences: {
          description:
            'Video only. Video ingredient ids for models supporting video references.',
          items: { type: 'string' },
          maxItems: 10,
          type: 'array',
        },
        voiceId: {
          description:
            'Voice only. Catalog or cloned voice id; omit when unknown.',
          type: 'string',
        },
        harness: {
          description:
            'Image or video only. Override saved prompt enhancement for this generation. False preserves the prompt text exactly.',
          type: 'boolean',
        },
        requestedSkillSlugs: {
          description:
            'Image or video only. Explicit skill selections for this generation; additive to brand guidance.',
          items: {
            maxLength: 160,
            minLength: 1,
            pattern: '^[a-zA-Z0-9][a-zA-Z0-9-]*$',
            type: 'string',
          },
          maxItems: 8,
          type: 'array',
        },
        selectedContext: {
          description:
            'Image or video only. Transient task context for this generation. Not saved as Knowledge unless capture_knowledge is used.',
          properties: {
            persist: {
              description:
                'Must stay false. Persistent save is a separate action.',
              type: 'boolean',
            },
            sourceIds: {
              description:
                'Authorized Knowledge source ids to apply to this task.',
              items: { type: 'string' },
              maxItems: 8,
              type: 'array',
            },
            text: {
              description: 'Task-only context text. Max 8000 characters.',
              type: 'string',
            },
          },
          type: 'object',
        },
      },
      required: ['type', 'prompt'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  ...OVERLAP_QUERY_TOOLS,
  ...OVERLAP_KNOWLEDGE_TOOLS,
  ...OVERLAP_GENERATION_TOOLS,
  ...OVERLAP_PUBLISHING_TOOLS,
  ...WORKFLOW_CONTROL_TOOLS,
];
