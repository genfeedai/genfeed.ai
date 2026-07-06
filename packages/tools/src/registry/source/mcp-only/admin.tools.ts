import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

/**
 * MCP admin tools.
 *
 * The darkroom/LoRA/GPU/training fleet-control tools were removed from the OSS
 * MCP surface in PR 5/6: they are `requiredRole: 'superadmin'` and the only
 * matching OSS API lives on the `['admin/fleet','admin/darkroom']` controller
 * behind `SuperAdminGuard` + `IpWhitelistGuard`, which an org-scoped `gf_` MCP
 * API key can never satisfy — so they 404/403 by construction on the public
 * MCP. Managed inference/fleet control is a private-console concern (kept out of
 * the public monorepo). They belong on the console MCP, not this one.
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
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
];
