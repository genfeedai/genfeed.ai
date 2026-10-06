import { BATCH_CAPTION_BASE_CREDITS } from '@genfeedai/contracts/constants/batch-generation-pricing.constant';
import { ENHANCE_PROMPT_CREDIT_COST } from '@genfeedai/contracts/constants/tool-credit.constant';
import type { SourceTool } from '../../interfaces/source-tool.interface';

/**
 * Batch-generation definition split out of `overlap.tools.ts` to keep that
 * module under the per-file line budget (`source-tools.test.ts`). Its Agent/MCP
 * availability is declared only in `curated-action-catalog.ts`.
 */
export const OVERLAP_GENERATION_TOOLS: SourceTool[] = [
  {
    name: 'enhance_prompt',
    description:
      'Preview a media prompt using the same Enhance implementation as Studio and Agent, with effective organization/brand settings and contributing pack metadata. Does not generate media. To generate the reviewed prompt unchanged, pass the returned prompt with harness:false. Model compilation during normal generation may add format-specific instructions; the generation receipt records the final submitted prompt.',
    creditCost: ENHANCE_PROMPT_CREDIT_COST,
    requiredRole: 'user',
    parameters: {
      type: 'object',
      required: ['prompt', 'contentType'],
      properties: {
        requestedSkillSlugs: {
          description:
            'Explicit skill selections for this generation; additive to brand guidance.',
          type: 'array',
          maxItems: 8,
          items: {
            type: 'string',
            minLength: 1,
            maxLength: 160,
            pattern: '^[a-zA-Z0-9][a-zA-Z0-9-]*$',
          },
        },

        prompt: { type: 'string' },
        contentType: { type: 'string', enum: ['image', 'video'] },
        brandId: { type: 'string' },
        model: { type: 'string' },
        harness: { type: 'boolean' },
      },
    },
  },
  {
    name: 'get_generation_options',
    description:
      'Read what generation can do right now: the effective image/video prompt enhancement settings with organization or brand overrides (settings, always returned), plus the Studio credit estimate and organization balance (cost, only when type is given). Returns the same catalog estimate the Generate composer shows and the same Genfeed balance as the credits bar. Does not charge credits, change a price, or authorize a generation. Omit modelKey, or pass Auto, for estimate status auto. Unsupported, missing, unpriced or voice and music types return estimate status unavailable with credits null. balance is null when the wallet cannot be read; a numeric 0 is a real empty balance. Threaded Agent calls use the validated current thread brand; brandId must match it. In threadless MCP calls, brandId selects the brand scope for settings.',
    creditCost: 0,
    requiredRole: 'user',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: {
          type: 'string',
          enum: ['image', 'image-edit', 'video', 'voice', 'music'],
          description:
            'Return a credit estimate and balance for this generation type. Omit to read settings only.',
        },
        brandId: {
          type: 'string',
          description: 'Brand whose settings overrides to read.',
        },
        modelKey: {
          type: 'string',
          description:
            'Cost only. Catalog model key. Omit for Auto, which has no estimate until a model is selected.',
        },
        aspectRatio: { type: 'string', description: 'Cost only.' },
        resolution: { type: 'string', description: 'Cost only.' },
        duration: { type: 'number', description: 'Cost only, in seconds.' },
        outputs: { type: 'number', description: 'Cost only.' },
        isAudioEnabled: {
          type: 'boolean',
          description:
            'Cost only, video. Price the clip with audio on; defaults to off, as Studio submits it.',
        },
      },
    },
  },
  {
    name: 'transform_media',
    description:
      'Change existing media or join clips. operation edit: apply an exact instruction to a Library image (the original stays unchanged; imageId is the primary source, references adds up to four ordered images for Ideogram or nine for FLUX.3; FLUX.3 supports one output, resolution and aspectRatio, with no mask or seed; optional maskId must match the primary dimensions, black changes and white stays; uses the image-editing category default, never the generation model; do not enhance or rewrite the instruction). operation reframe: re-crop an image to a new aspect ratio. operation upscale: upscale an image to higher resolution from its URL. operation merge: join two or more existing videos into one clip with transitions, captions, resizing, mute and background music; slideshow zoom (zoomEaseCurve and zoomConfigs) is not supported and is rejected before any merge starts. Each field lists the operations it applies to; a field for another operation is rejected. Edit, reframe and upscale spend credits through the shared generation settlement; merge runs locally and is free.',
    creditCost: 0,
    requiredRole: 'user',
    parameters: {
      type: 'object',
      required: ['operation'],
      additionalProperties: false,
      properties: {
        operation: {
          type: 'string',
          enum: ['edit', 'reframe', 'upscale', 'merge'],
          description: 'Which transform to run.',
        },
        brandId: {
          type: 'string',
          description:
            'All operations. Brand scope; must match the thread brand.',
        },
        imageId: {
          type: 'string',
          description:
            'edit, reframe. ID of the existing Library image to transform.',
        },
        imageUrl: {
          type: 'string',
          description: 'upscale. URL of the image to upscale.',
        },
        prompt: {
          type: 'string',
          minLength: 1,
          maxLength: 20000,
          description: 'edit. Exact editing instruction. Required for edit.',
        },
        model: {
          type: 'string',
          description: 'edit. Image-editing model key.',
        },
        references: {
          type: 'array',
          maxItems: 9,
          uniqueItems: true,
          items: { type: 'string' },
          description: 'edit. Extra ordered reference image IDs.',
        },
        resolution: {
          type: 'string',
          enum: ['768sq', '1k', '1.5k', '2k', '4k'],
          description: 'edit. FLUX.3 only; default 1k.',
        },
        aspectRatio: {
          type: 'string',
          description:
            'edit: FLUX.3 only; auto matches the first source aspect ratio. reframe: target ratio, one of 1:1, 16:9, 9:16, 4:3, 3:4 (default 1:1).',
        },
        maskId: {
          type: 'string',
          description:
            'edit. Mask image ID matching the primary dimensions: black changes, white stays.',
        },
        size: {
          type: 'string',
          enum: [
            'source',
            '1024x1024',
            '1280x896',
            '896x1280',
            '1344x768',
            '768x1344',
            '1536x640',
            '640x1536',
          ],
          description: 'edit. Output size.',
        },
        outputs: {
          type: 'integer',
          minimum: 1,
          maximum: 8,
          description: 'edit. Number of outputs.',
        },
        seed: {
          type: 'integer',
          minimum: 0,
          maximum: 2147483647,
          description: 'edit. Deterministic seed.',
        },
        ids: {
          type: 'array',
          minItems: 2,
          items: { type: 'string' },
          description:
            'merge. Ordered video ingredient ids to join (at least two). Required for merge.',
        },
        isCaptionsEnabled: {
          type: 'boolean',
          description:
            'merge. Burn transcribed captions into the merged video.',
        },
        isMuteVideoAudio: {
          type: 'boolean',
          description: 'merge. Mute the original audio from the source clips.',
        },
        isResizeEnabled: {
          type: 'boolean',
          description:
            'merge. Fit the joined video to portrait 1080x1920 after merge.',
        },
        music: {
          type: 'string',
          description:
            'merge. Music ingredient id to lay under the merged video.',
        },
        musicVolume: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'merge. Background music volume from 0 to 100.',
        },
        transition: {
          type: 'string',
          enum: [
            'none',
            'fade',
            'dissolve',
            'wipeleft',
            'wiperight',
            'wipeup',
            'wipedown',
            'circleopen',
            'circleclose',
            'slideleft',
            'slideright',
          ],
          description:
            'merge. Transition between clips. Defaults to a cut when omitted.',
        },
        transitionDuration: {
          type: 'number',
          minimum: 0.1,
          maximum: 2,
          description: 'merge. Transition length in seconds (0.1-2).',
        },
        transitionEaseCurve: {
          type: 'string',
          enum: [
            'easyinoutexpo',
            'easyinexpooutcubic',
            'easyinquartoutquad',
            'easyinoutcubic',
            'easyinoutsine',
          ],
          description: 'merge. Ease curve for the transition between clips.',
        },
      },
    },
  },
  {
    name: 'set_generation_settings',
    description:
      'Set organization or brand prompt enhancement. Use null to restore inheritance. Threaded Agent calls use the validated current thread brand; brandId must match it. In threadless MCP calls, brandId selects the brand scope. Generation pricing is unchanged.',
    creditCost: 0,
    requiredRole: 'user',
    parameters: {
      type: 'object',
      required: ['scope', 'isEnabled'],
      properties: {
        scope: { type: 'string', enum: ['organization', 'brand'] },
        brandId: { type: 'string' },
        isEnabled: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
      },
    },
  },
  {
    // Floor for preflight only. Real amount is format+model-aware and billed
    // dynamically in the handler (isBillingDelegated).
    creditCost: BATCH_CAPTION_BASE_CREDITS,
    description:
      'Generate a batch of content (images, videos, carousels) for a brand. Specify count, platforms, and date range. Use handle param to resolve @username to a credential. Returns a batch ID for tracking. Credits scale by item format and caption model tier — not a flat fee.',
    name: 'generate_content_batch',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to generate content for',
          type: 'string',
        },
        contentMix: {
          description:
            'Content format distribution (e.g., { imagePercent: 60, videoPercent: 25, carouselPercent: 10, reelPercent: 5, storyPercent: 0 })',
          properties: {
            carouselPercent: { type: 'number' },
            imagePercent: { type: 'number' },
            reelPercent: { type: 'number' },
            storyPercent: { type: 'number' },
            videoPercent: { type: 'number' },
          },
          type: 'object',
        },
        count: {
          description: 'Number of content pieces to generate (1-100)',
          type: 'number',
        },
        dateRange: {
          description:
            'Scheduling window: dates or ISO 8601 timestamps with UTC offset (e.g., { start: "2026-02-10", end: "2026-02-17" } or { start: "2026-02-10T15:00:00+01:00", end: "2026-02-10T23:00:00+01:00" }). Items are spaced evenly across it, both ends inclusive.',
          properties: {
            end: { type: 'string' },
            start: { type: 'string' },
          },
          required: ['start', 'end'],
          type: 'object',
        },
        handle: {
          description:
            'Social media handle to resolve (e.g., "@example_person"). Will auto-resolve to brandId and credential.',
          type: 'string',
        },
        platforms: {
          description: 'Target platforms for content',
          items: { type: 'string' },
          type: 'array',
        },
        style: {
          description:
            'Style direction for generation (e.g., "lifestyle", "professional", "urban")',
          type: 'string',
        },
        topics: {
          description: 'Content topics or themes',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['count', 'platforms'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
