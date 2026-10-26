import type { SourceTool } from '../../../interfaces/source-tool.interface';

const id = {
  type: 'string',
  minLength: 1,
  maxLength: 255,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$',
};
const revision = { type: 'integer', minimum: 1 };
const stage = {
  type: 'string',
  enum: ['cutaways', 'animatic', 'presenter'],
  description:
    'cutaways: B-roll stills. animatic: cheap spoken draft. presenter: HeyGen Avatar IV render.',
};
const cutawayIds = {
  type: 'array',
  items: id,
  minItems: 1,
  maxItems: 60,
  uniqueItems: true,
};
const inputHash = { type: 'string', pattern: '^[a-f0-9]{64}$' };

export const MCP_STORYBOARD_CAPABILITY_TOOLS: SourceTool[] = [
  {
    name: 'storyboard_run_capabilities',
    description:
      'Read the current brand-scoped storyboard video model, supported durations, interpolation eligibility and capability version without generating or changing defaults.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { brandId: id, runId: id },
      required: ['brandId', 'runId'],
    },
    creditCost: 0,
    requiredRole: 'user',
  },
  {
    name: 'storyboard_long_form',
    description:
      'Work on a long-form storyboard (voice note to presenter video). get reads the run and plan; draft_plan drafts or revises the plan from the brief (instruction); update_plan saves an edited plan; approve_plan locks it; quote prices one paid stage and returns its inputHash; reconcile picks up finished renders; assemble opens the animatic or final edit as an Editor project. Never charges credits.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: [
            'get',
            'draft_plan',
            'update_plan',
            'approve_plan',
            'quote',
            'reconcile',
            'assemble',
          ],
        },
        brandId: id,
        runId: id,
        expectedRevision: {
          ...revision,
          description:
            'Run revision from get; required for draft_plan, update_plan, approve_plan and quote.',
        },
        instruction: {
          type: 'string',
          minLength: 1,
          maxLength: 2000,
          description: 'draft_plan only: how to revise the current plan.',
        },
        plan: {
          type: 'object',
          description: 'update_plan only: the whole plan from get, edited.',
        },
        stage: { ...stage, description: `quote only. ${stage.description}` },
        cutawayIds: {
          ...cutawayIds,
          description:
            'quote with stage cutaways: these cutaways; omit for every cutaway without footage.',
        },
        track: {
          type: 'string',
          enum: ['animatic', 'final'],
          description: 'assemble only: the draft or the finished video.',
        },
      },
      required: ['action', 'brandId', 'runId'],
    },
    creditCost: 0,
    requiredRole: 'user',
  },
  {
    name: 'start_storyboard_long_form',
    description:
      'Start one quoted paid stage of a long-form storyboard after the user accepts the price from storyboard_long_form quote. Pass the quote inputHash; a changed plan is refused, and finished renders are not charged again. Then call storyboard_long_form reconcile until the stage is ready.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        brandId: id,
        runId: id,
        stage,
        expectedRevision: revision,
        inputHash: {
          ...inputHash,
          description: 'inputHash from the accepted quote.',
        },
        cutawayIds: {
          ...cutawayIds,
          description: 'stage cutaways only: the quoted cutaway ids.',
        },
      },
      required: ['brandId', 'runId', 'stage', 'expectedRevision', 'inputHash'],
    },
    creditCost: 0,
    requiredRole: 'user',
  },
];
