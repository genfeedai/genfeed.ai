import type { SourceTool } from '../../interfaces/source-tool.interface';
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
      'Create a post draft. On MCP this never publishes: confirmed is rejected, and publishing uses create_scheduled_release. The in-app agent still confirms publishing with a confirmation card.',
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
    // Minimum charge per call (standard image; 4k costs more). Actual amount
    // is billed dynamically by the generation endpoint (issue #482).
    creditCost: 50,
    description:
      'Generate AI images with a custom prompt, style, and dimensions. Returns generationHarness with the exact submitted prompt and enhancement status. Show that prompt with the result instead of reconstructing it.',
    name: 'generate_image',
    parameters: {
      properties: {
        harness: {
          type: 'boolean',
          description:
            'Override saved prompt enhancement for this generation only. False preserves prompt text exactly.',
        },
        aspectRatio: {
          description: 'Aspect ratio of the generated image',
          type: 'string',
        },
        brandId: {
          description:
            'Brand that owns this generation. Required when the organization has more than one brand.',
          type: 'string',
        },
        characterHandles: {
          description:
            'Brand character handles resolved into reference images. Max 4; unresolvable handles fail the call.',
          items: { type: 'string' },
          maxItems: 4,
          type: 'array',
        },
        outputs: {
          description: 'Number of image variants to generate',
          maximum: 8,
          minimum: 1,
          type: 'integer',
        },
        prompt: {
          description: 'Description of the image to generate',
          type: 'string',
        },
        references: {
          description:
            'Asset/ingredient ids or URLs used as visual references, not the prompt. Max 8.',
          items: { type: 'string' },
          maxItems: 8,
          type: 'array',
        },
        selectedContext: {
          description:
            'Transient task context for this generation only. Not saved as Knowledge unless capture_knowledge is used.',
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
        quality: {
          default: 'standard',
          description: 'Image quality',
          enum: ['standard', 'hd'],
          type: 'string',
        },
        size: {
          default: 'square',
          description: 'Image dimensions',
          enum: [
            'square',
            'portrait',
            'landscape',
            '1024x1024',
            '1792x1024',
            '1024x1792',
          ],
          type: 'string',
        },
        style: {
          default: 'realistic',
          description: 'Artistic style',
          enum: [
            'realistic',
            'artistic',
            'abstract',
            'cartoon',
            'photographic',
            'digital-art',
          ],
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    // Minimum charge per call (cheapest music model). Actual amount is billed
    // dynamically by the generation endpoint per model cost (issue #482).
    creditCost: 10,
    description:
      'Generate music or audio using AI. Describe the desired music style, mood, instruments, and genre. Returns the audio URL.',
    name: 'generate_music',
    parameters: {
      properties: {
        duration: {
          default: 60,
          description: 'Duration in seconds',
          maximum: 300,
          minimum: 10,
          type: 'number',
        },
        genre: {
          description: 'Music genre',
          enum: [
            'ambient',
            'electronic',
            'rock',
            'classical',
            'jazz',
            'pop',
            'cinematic',
          ],
          type: 'string',
        },
        mood: {
          description: 'Music mood',
          enum: [
            'upbeat',
            'calm',
            'energetic',
            'dramatic',
            'happy',
            'sad',
            'inspirational',
          ],
          type: 'string',
        },
        prompt: {
          description: 'Description of the music to generate',
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    // Minimum charge per call (shortest 4s clip). Actual amount is billed
    // dynamically by the generation endpoint per duration (issue #482).
    creditCost: 300,
    description:
      'Generate a video from a prompt. Add imageUrl+audioUrl for talking-avatar lip-sync. Returns the video URL and generationHarness with the exact submitted prompt and enhancement status. Show that prompt with the result instead of reconstructing it.',
    name: 'generate_video',
    parameters: {
      properties: {
        harness: {
          type: 'boolean',
          description:
            'Override saved prompt enhancement for this generation only. False preserves prompt text exactly.',
        },
        aspectRatio: {
          description: 'Aspect ratio of the video',
          enum: ['16:9', '9:16', '1:1'],
          type: 'string',
        },
        brandId: {
          description:
            'Brand that owns this generation. Required when the organization has more than one brand.',
          type: 'string',
        },
        audioUrl: {
          description:
            'Audio URL for avatar generation; with imageUrl, lip-syncs via Kling Avatar V2.',
          type: 'string',
        },
        duration: {
          description:
            'Duration in seconds; model clamps or rejects out-of-range values.',
          type: 'number',
        },
        characterHandles: {
          description:
            'Character handles resolved to reference images. Max 4; distinct from imageUrl.',
          items: { type: 'string' },
          maxItems: 4,
          type: 'array',
        },
        imageUrl: {
          description:
            'Start-frame image URL for image-to-video or avatar generation.',
          type: 'string',
        },
        model: {
          description: 'Model key; omit for auto router selection.',
          type: 'string',
        },
        endFrame: {
          description: 'Image ingredient id for the final frame.',
          type: 'string',
        },
        prompt: {
          description: 'Description of the video to generate',
          type: 'string',
        },
        selectedContext: {
          description:
            'Transient task context for this generation only. Not saved as Knowledge unless capture_knowledge is used.',
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
        references: {
          description:
            'Asset/ingredient ids or URLs as character/style references, not the start frame. Max 8.',
          items: { type: 'string' },
          maxItems: 8,
          type: 'array',
        },
        resolution: {
          description: 'Model-native resolution; unsupported values rejected.',
          enum: [
            '360p',
            '480p',
            '480P',
            '720p',
            '768p',
            '768P',
            '1080p',
            '1080P',
            '2K',
            'standard',
            'pro',
            '4k',
          ],
          type: 'string',
        },
        videoReferences: {
          description:
            'Video ingredient ids for models supporting video references.',
          items: { type: 'string' },
          maxItems: 10,
          type: 'array',
        },
      },
      required: ['prompt'],
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
