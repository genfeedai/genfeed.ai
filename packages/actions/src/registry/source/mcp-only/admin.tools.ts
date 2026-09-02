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
      'Approve or decline a pending MCP write action that was queued for human review, executing it on approval. Pass the approvalId returned by the original (pending) tool call. Superadmin-only.',
    name: 'resolve_approval',
    parameters: {
      properties: {
        approvalId: {
          description: 'The approval ID returned by the pending tool call',
          type: 'string',
        },
        decision: {
          description:
            'approve to execute the queued action, decline to cancel it',
          enum: ['approve', 'decline'],
          type: 'string',
        },
      },
      required: ['approvalId', 'decision'],
      type: 'object',
    },
    requiredRole: 'superadmin',
  },
];
