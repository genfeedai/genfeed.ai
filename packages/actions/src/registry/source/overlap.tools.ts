import type { SourceTool } from '../../interfaces/source-tool.interface';
import { OVERLAP_GENERATION_TOOLS } from './overlap-generation.tools';
import { OVERLAP_KNOWLEDGE_TOOLS } from './overlap-knowledge.tools';
import { OVERLAP_PUBLISHING_TOOLS } from './overlap-publishing.tools';
import { OVERLAP_QUERY_TOOLS } from './overlap-query.tools';
import { WORKFLOW_CONTROL_TOOLS } from './workflow-control.tools';

export const OVERLAP_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Create a post draft, or confirm direct publishing for an existing item via a confirmation card.',
    name: 'create_post',
    parameters: {
      properties: {
        caption: {
          description: 'Caption override for the content item.',
          type: 'string',
        },
        confirmed: {
          description:
            'Set to true only after the user confirms the publish card.',
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
          enum: [
            'instagram',
            'twitter',
            'linkedin',
            'tiktok',
            'youtube',
            'facebook',
          ],
          type: 'string',
        },
        platforms: {
          description: 'Platforms to publish the content item to.',
          items: {
            enum: [
              'instagram',
              'twitter',
              'linkedin',
              'tiktok',
              'youtube',
              'facebook',
            ],
            type: 'string',
          },
          type: 'array',
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
  {
    creditCost: 0,
    description:
      'Create a workflow: direct graph, a recurring scaffold, or natural-language generation. Editable in the Workflows app.',
    name: 'create_workflow',
    parameters: {
      properties: {
        aspectRatio: {
          description: 'Aspect ratio for recurring assets.',
          enum: ['1:1', '4:5', '9:16', '16:9'],
          type: 'string',
        },
        brandId: {
          description: 'Brand ID; defaults to the selected brand.',
          type: 'string',
        },
        contentType: {
          description: 'Content type for the recurring scaffold.',
          enum: ['image', 'video', 'post', 'newsletter'],
          type: 'string',
        },
        count: {
          description: 'Assets to generate per scheduled run.',
          type: 'number',
        },
        description: {
          description: 'Natural-language description.',
          type: 'string',
        },
        diversityMode: {
          description: 'Variation level for recurring assets.',
          enum: ['low', 'medium', 'high'],
          type: 'string',
        },
        edges: {
          items: { type: 'object' },
          type: 'array',
        },
        inputVariables: {
          description: 'Input variable definitions.',
          items: { type: 'object' },
          type: 'array',
        },
        isScheduleEnabled: {
          type: 'boolean',
        },
        label: {
          description: 'Label shown in the Workflows app.',
          type: 'string',
        },
        metadata: {
          type: 'object',
        },
        model: {
          description: 'Model override for recurring flows.',
          type: 'string',
        },
        negativePrompt: {
          description: 'What recurring generations should avoid.',
          type: 'string',
        },
        nodes: {
          items: { type: 'object' },
          type: 'array',
        },
        prompt: {
          description: 'Recurring generation brief (with schedule).',
          type: 'string',
        },
        schedule: {
          description: 'Cron expression for recurrence.',
          type: 'string',
        },
        sourceAssetId: {
          description: 'Source asset ID for the brief.',
          type: 'string',
        },
        styleNotes: {
          description: 'Creative direction or brand guardrails.',
          type: 'string',
        },
        targetPlatforms: {
          description: 'Platform hints for generation.',
          items: { type: 'string' },
          type: 'array',
        },
        templateId: {
          type: 'string',
        },
        timezone: {
          description: 'Schedule timezone.',
          type: 'string',
        },
        trigger: {
          type: 'string',
        },
      },
      required: ['label'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Execute an existing workflow immediately. Select nodeIds to rerun edited steps while reusing locked outputs; pass required variables for full or partial execution.',
    name: 'execute_workflow',
    parameters: {
      properties: {
        nodeIds: {
          description:
            'Nonempty list of node IDs to rerun. Include affected downstream steps; unavailable dependencies fail explicitly.',
          items: { minLength: 1, type: 'string' },
          minItems: 1,
          uniqueItems: true,
          type: 'array',
        },
        respectLocks: {
          default: true,
          description:
            'Reuse locked outputs by default; set false to regenerate selected locked nodes.',
          type: 'boolean',
        },
        variables: {
          description:
            'Variables to pass to the workflow (e.g., topic, style, platforms)',
          type: 'object',
        },
        workflowId: {
          description: 'ID of the workflow to execute',
          type: 'string',
        },
      },
      required: ['workflowId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    // Minimum charge per call (standard image; 4k costs more). Actual amount
    // is billed dynamically by the generation endpoint (issue #482).
    creditCost: 50,
    description:
      'Generate AI images with a custom prompt, style, and dimensions.',
    name: 'generate_image',
    parameters: {
      properties: {
        aspectRatio: {
          description: 'Aspect ratio of the generated image',
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
      'Generate a video from a prompt. Add imageUrl+audioUrl for talking-avatar lip-sync. Returns the video URL.',
    name: 'generate_video',
    parameters: {
      properties: {
        aspectRatio: {
          description: 'Aspect ratio of the video',
          enum: ['16:9', '9:16', '1:1'],
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
            '720p',
            '768p',
            '768P',
            '1080p',
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
