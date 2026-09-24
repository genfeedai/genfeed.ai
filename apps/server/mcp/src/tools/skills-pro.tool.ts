import type { ClientService } from '@mcp/services/client.service';

export const SKILLS_PRO_TOOL_NAMES = new Set([
  'archive_skill',
  'create_skill',
  'export_skill',
  'fork_skill',
  'install_skills_pro_skill',
  'publish_skill',
  'rollback_skill',
  'verify_skills_pro_entitlement',
]);

export async function handleSkillsProTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  if (name === 'verify_skills_pro_entitlement') {
    const result = await client.verifySkillsProEntitlement(
      requiredString(args, 'receiptId'),
    );
    return textJsonResult('Skills Pro entitlement', result);
  }

  if (name === 'create_skill') {
    const result = await client.createScopedSkill({
      description: requiredString(args, 'description'),
      instructions: requiredString(args, 'instructions'),
      name: requiredString(args, 'name'),
      ownerKind: typeof args.ownerKind === 'string' ? args.ownerKind : 'user',
      slug: requiredString(args, 'slug'),
    });
    return textJsonResult('Skill created', result);
  }

  if (name === 'fork_skill') {
    return textJsonResult(
      'Skill forked',
      await client.forkSkill(requiredString(args, 'skillId')),
    );
  }

  if (name === 'export_skill') {
    return textJsonResult(
      'Skill exported',
      await client.exportSkill(requiredString(args, 'skillId')),
    );
  }

  if (name === 'publish_skill') {
    const audience = args.audience === 'public' ? 'public' : 'organization';
    return textJsonResult(
      'Skill published',
      await client.publishSkill(requiredString(args, 'skillId'), audience),
    );
  }

  if (name === 'archive_skill') {
    return textJsonResult(
      'Skill archived',
      await client.archiveSkill(requiredString(args, 'skillId')),
    );
  }

  if (name === 'rollback_skill') {
    return textJsonResult(
      'Skill rolled back',
      await client.rollbackSkill(
        requiredString(args, 'skillId'),
        requiredString(args, 'versionId'),
      ),
    );
  }

  if (name === 'install_skills_pro_skill') {
    const result = await client.installSkillsProSkill(
      requiredString(args, 'receiptId'),
      requiredString(args, 'skillSlug'),
    );
    return textJsonResult('Skills Pro skill installed', result);
  }

  throw new Error(`Unknown Skills Pro tool: ${name}`);
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} required`);
  }
  return value;
}

function textJsonResult(label: string, payload: unknown) {
  return {
    content: [
      {
        text: `${label}:\n\n${JSON.stringify(payload, null, 2)}`,
        type: 'text' as const,
      },
    ],
  };
}
