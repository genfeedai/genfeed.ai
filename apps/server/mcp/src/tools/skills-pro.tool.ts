import type { ClientService } from '@mcp/services/client.service';

export const SKILLS_PRO_TOOL_NAMES = new Set([
  'install_skills_pro_skill',
  'verify_skills_pro_entitlement',
]);

export async function handleSkillsProTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  const receiptId = requiredString(args, 'receiptId');

  if (name === 'verify_skills_pro_entitlement') {
    const result = await client.verifySkillsProEntitlement(receiptId);
    return textJsonResult('Skills Pro entitlement', result);
  }

  if (name === 'install_skills_pro_skill') {
    const result = await client.installSkillsProSkill(
      receiptId,
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
