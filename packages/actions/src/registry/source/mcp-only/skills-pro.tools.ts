import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const MCP_SKILLS_PRO_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Verify a Skills Pro receipt for the authenticated organization and list the exact skill slugs it grants.',
    name: 'verify_skills_pro_entitlement',
    parameters: {
      properties: {
        receiptId: {
          description: 'Opaque Skills Pro receipt ID from checkout',
          type: 'string',
        },
      },
      required: ['receiptId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Install one entitled Skills Pro pack into the authenticated organization runtime after integrity verification.',
    name: 'install_skills_pro_skill',
    parameters: {
      properties: {
        receiptId: {
          description: 'Opaque Skills Pro receipt ID from checkout',
          type: 'string',
        },
        skillSlug: {
          description: 'Entitled skill slug to install',
          type: 'string',
        },
      },
      required: ['receiptId', 'skillSlug'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
