import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const MCP_SKILLS_PRO_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Create a personal, organization, or brand skill. The default owner is the caller.',
    name: 'create_skill',
    parameters: {
      properties: {
        description: { type: 'string' },
        instructions: { type: 'string' },
        name: { type: 'string' },
        ownerKind: { enum: ['user', 'organization', 'brand'], type: 'string' },
        slug: { type: 'string' },
      },
      required: ['name', 'slug', 'description', 'instructions'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'Fork a skill into the caller personal library.',
    name: 'fork_skill',
    parameters: {
      properties: { skillId: { type: 'string' } },
      required: ['skillId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Export instruction text when the caller is allowed to export it.',
    name: 'export_skill',
    parameters: {
      properties: { skillId: { type: 'string' } },
      required: ['skillId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Publish the current skill version to the organization or publicly.',
    name: 'publish_skill',
    parameters: {
      properties: {
        audience: { enum: ['organization', 'public'], type: 'string' },
        skillId: { type: 'string' },
      },
      required: ['skillId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'Uninstall a skill the caller governs.',
    name: 'archive_skill',
    parameters: {
      properties: { skillId: { type: 'string' } },
      required: ['skillId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Restore a governed skill to an earlier captured version. A Skills Pro reinstall is the update path.',
    name: 'rollback_skill',
    parameters: {
      properties: {
        skillId: { type: 'string' },
        versionId: { type: 'string' },
      },
      required: ['skillId', 'versionId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
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
