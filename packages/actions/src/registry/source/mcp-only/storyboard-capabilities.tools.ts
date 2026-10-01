import type { SourceTool } from '../../../interfaces/source-tool.interface';

const id = {
  type: 'string',
  minLength: 1,
  maxLength: 255,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$',
};
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
];
