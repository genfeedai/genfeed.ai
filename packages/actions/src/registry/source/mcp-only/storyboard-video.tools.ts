import type { SourceTool } from '../../../interfaces/source-tool.interface';

/**
 * The realistic shot-by-shot video tools (#9622): one free tool for reads,
 * edits, quotes, reconcile and assembly, and one hash-bound paid stage.
 */
const id = {
  type: 'string',
  minLength: 1,
  maxLength: 255,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$',
};
const revision = { type: 'integer', minimum: 1 };
const inputHash = { type: 'string', minLength: 64, maxLength: 64 };
const assetIds = { type: 'array', items: id, maxItems: 20 };
const videoStage = {
  type: 'string',
  enum: ['assets', 'stills', 'draft', 'final'],
  description:
    'assets: asset bible images. stills: start frames. draft: cheap motion check. final: full quality, checked before assembly.',
};
const shotIds = {
  type: 'array',
  items: id,
  minItems: 1,
  maxItems: 12,
  uniqueItems: true,
};
/** The asset bible entry and what to make for it, for the assets stage. */
const assetTarget = {
  entryId: { ...id, description: 'stage assets only: the entry id from get.' },
  assetAction: {
    type: 'string',
    enum: ['variants', 'angles', 'costume', 'edit'],
    description:
      'stage assets only. variants: new candidates. angles: the chosen image from other angles. costume: the real person dressed in the chosen costume. edit: change the chosen place (instruction).',
  },
  count: {
    type: 'integer',
    minimum: 1,
    maximum: 4,
    description: 'assetAction variants: how many.',
  },
  angles: {
    type: 'array',
    minItems: 1,
    maxItems: 6,
    items: { type: 'string', minLength: 1, maxLength: 60 },
    description: 'assetAction angles: for example "the back", "left profile".',
  },
};

export const MCP_STORYBOARD_VIDEO_TOOLS: SourceTool[] = [
  {
    name: 'storyboard_video',
    description:
      "Work on a realistic shot-by-shot video (up to 12 shots, under a minute). Follow the video-realism skill when it is installed. create starts one from an idea, script or shot list (brief) with optional format, runtimeBudgetSeconds, styleReferenceAssetIds and cast reference images; get reads the run, every shot with its still, draft and final render and QA, and the asset bible; draft_plan drafts or revises the shots (instruction); edit_shots changes shots by id (action, dialogue, durationSeconds, timed cuts, sfx, referenceRoles, or an exact videoPrompt; an empty one restores the compiled prompt); assets adds, changes or removes asset bible entries (faces, bodies and costumes, props, places) and picks each one's chosenAssetId; approve_plan locks the shots; quote prices one paid stage and returns its inputHash (assets: entryId with assetAction variants, angles, costume or edit; stills, draft or final: shotIds, or omit for every shot that needs it); estimate prices the stills, drafts and finals still left without holding credits; reconcile picks up finished images and renders and checks new finals; assemble opens the checked finals as an Editor project. Never charges credits, schedules or publishes.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: [
            'create',
            'get',
            'draft_plan',
            'edit_shots',
            'assets',
            'approve_plan',
            'quote',
            'estimate',
            'reconcile',
            'assemble',
          ],
        },
        brandId: id,
        runId: { ...id, description: 'Every action except create.' },
        clientRequestId: {
          type: 'string',
          format: 'uuid',
          description: 'create only: a new UUID for this video.',
        },
        brief: {
          type: 'string',
          minLength: 1,
          maxLength: 2000,
          description: 'create only: the idea, script or shot list.',
        },
        format: {
          type: 'string',
          enum: ['9:16', '16:9', '1:1'],
          description: 'create only: the frame shape. Default 9:16.',
        },
        runtimeBudgetSeconds: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: 60,
          description: 'create only: target length of the whole video.',
        },
        styleReferenceAssetIds: {
          ...assetIds,
          description:
            'create only: images every shot is drawn in the style of.',
        },
        cast: {
          type: 'array',
          maxItems: 6,
          description:
            'create only: recurring people or products, each kept consistent from its reference images.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 80 },
              referenceAssetIds: { ...assetIds, minItems: 1 },
            },
            required: ['name', 'referenceAssetIds'],
          },
        },
        expectedRevision: {
          ...revision,
          description:
            'Run revision from get; required for draft_plan, edit_shots, assets, approve_plan, quote and estimate.',
        },
        instruction: {
          type: 'string',
          minLength: 1,
          maxLength: 2000,
          description:
            'draft_plan: how to revise the shots. quote with assetAction edit: how to change the chosen place.',
        },
        shots: {
          type: 'array',
          minItems: 1,
          maxItems: 12,
          description:
            'edit_shots only: shots to change, by id from get. Omitted fields stay.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id,
              action: { type: 'string', minLength: 1, maxLength: 4000 },
              dialogue: { type: 'string', maxLength: 500 },
              durationSeconds: {
                type: 'number',
                exclusiveMinimum: 0,
                maximum: 60,
              },
              cuts: {
                type: 'array',
                maxItems: 8,
                description:
                  'Timed cuts inside the clip, for example 0-2 s close-up.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    startSeconds: { type: 'number', minimum: 0, maximum: 60 },
                    endSeconds: {
                      type: 'number',
                      exclusiveMinimum: 0,
                      maximum: 60,
                    },
                    framing: { type: 'string', minLength: 1, maxLength: 200 },
                    camera: { type: 'string', maxLength: 200 },
                  },
                  required: ['startSeconds', 'endSeconds', 'framing'],
                },
              },
              sfx: {
                type: 'array',
                maxItems: 8,
                items: { type: 'string', minLength: 1, maxLength: 200 },
              },
              referenceRoles: {
                type: 'array',
                maxItems: 12,
                description:
                  'Images the shot names, each with its role and who or what it is.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    assetId: id,
                    role: {
                      type: 'string',
                      enum: [
                        'environment',
                        'character_face',
                        'character_body',
                        'prop',
                        'style',
                      ],
                    },
                    label: { type: 'string', maxLength: 60 },
                  },
                  required: ['assetId', 'role'],
                },
              },
              videoPrompt: {
                type: 'string',
                maxLength: 4000,
                description:
                  'The exact video prompt; an empty string goes back to the compiled one.',
              },
            },
            required: ['id'],
          },
        },
        entries: {
          type: 'array',
          maxItems: 40,
          description:
            'assets only: entries to add or change, by id. Generated variants stay.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id,
              kind: {
                type: 'string',
                enum: [
                  'character_face',
                  'character_body',
                  'prop',
                  'environment',
                ],
              },
              label: { type: 'string', minLength: 1, maxLength: 60 },
              castMemberId: {
                ...id,
                description: 'Faces and bodies: the cast member from get.',
              },
              brief: {
                type: 'string',
                maxLength: 1000,
                description: 'What to make: the costume, the prop, the place.',
              },
              sourceAssetIds: {
                type: 'array',
                items: id,
                maxItems: 8,
                description:
                  'Real photos of a person, or reference stills of a place.',
              },
              chosenAssetId: {
                ...id,
                description: "One of the entry's own sources or variants.",
              },
              sheetEnvironment: {
                type: 'string',
                enum: ['neutral', 'outdoor'],
                description: 'Bodies only. Default outdoor.',
              },
            },
            required: ['id', 'kind', 'label'],
          },
        },
        removeEntryIds: {
          type: 'array',
          items: id,
          maxItems: 40,
          description: 'assets only: entries to remove.',
        },
        stage: {
          ...videoStage,
          description: `quote only. ${videoStage.description}`,
        },
        shotIds: {
          ...shotIds,
          description:
            'quote with stage stills, draft or final: these shots; omit for every shot that needs it.',
        },
        ...assetTarget,
      },
      required: ['action', 'brandId'],
    },
    creditCost: 0,
    requiredRole: 'user',
  },
  {
    name: 'start_storyboard_video',
    description:
      'Start one quoted paid stage of a realistic video after the user accepts the price from storyboard_video quote. Pass the quote inputHash and the same stage and targets; a changed plan is refused. Then call storyboard_video reconcile until the stage is ready. Check drafts before quoting finals: a final that follows a current draft reuses its prompt and references.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        brandId: id,
        runId: id,
        stage: videoStage,
        expectedRevision: revision,
        inputHash: {
          ...inputHash,
          description: 'inputHash from the accepted quote.',
        },
        shotIds: {
          ...shotIds,
          description: 'stills, draft and final: the quoted shot ids.',
        },
        ...assetTarget,
      },
      required: ['brandId', 'runId', 'stage', 'expectedRevision', 'inputHash'],
    },
    creditCost: 0,
    requiredRole: 'user',
  },
];
