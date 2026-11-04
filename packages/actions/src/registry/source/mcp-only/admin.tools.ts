import type { SourceTool } from '../../../interfaces/source-tool.interface';

/**
 * MCP admin tools.
 *
 * LoRA, GPU runtime lifecycle, and managed-inference control are private-console
 * concerns. Their API and MCP surfaces intentionally do not exist in the public
 * monorepo.
 */
export const MCP_ADMIN_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Owners/admins: decline a pending MCP write action, or run one a person has already approved in the Genfeed review inbox. Approving itself only happens in the inbox, never through MCP. Pass the approvalId returned by the original (pending) tool call.',
    name: 'resolve_approval',
    parameters: {
      properties: {
        approvalId: {
          description: 'The approval ID returned by the pending tool call',
          type: 'string',
        },
        decision: {
          description:
            'approve to run an action already approved in the review inbox, decline to cancel it',
          enum: ['approve', 'decline'],
          type: 'string',
        },
      },
      required: ['approvalId', 'decision'],
      type: 'object',
    },
    requiredRole: 'admin',
  },
];
