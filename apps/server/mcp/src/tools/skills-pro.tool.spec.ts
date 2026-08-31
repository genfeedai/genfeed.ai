import type { ClientService } from '@mcp/services/client.service';
import { handleSkillsProTool } from '@mcp/tools/skills-pro.tool';

describe('Skills Pro MCP tools', () => {
  const verifySkillsProEntitlement = vi.fn();
  const installSkillsProSkill = vi.fn();
  const client = {
    installSkillsProSkill,
    verifySkillsProEntitlement,
  } as unknown as ClientService;

  beforeEach(() => vi.clearAllMocks());

  it('verifies an organization entitlement without exposing pack data', async () => {
    verifySkillsProEntitlement.mockResolvedValue({
      email: '',
      productType: 'skill',
      skills: ['image-gen-pro'],
      valid: true,
    });

    const result = await handleSkillsProTool(
      client,
      'verify_skills_pro_entitlement',
      { receiptId: 'sk_rcpt_one' },
    );

    expect(verifySkillsProEntitlement).toHaveBeenCalledWith('sk_rcpt_one');
    expect(result.content[0].text).toContain('image-gen-pro');
  });

  it('installs one explicitly selected entitled skill', async () => {
    installSkillsProSkill.mockResolvedValue({
      id: 'skill-1',
      name: 'Image Gen Pro',
      slug: 'image-gen-pro',
      status: 'installed',
      version: '1.0.0',
    });

    await handleSkillsProTool(client, 'install_skills_pro_skill', {
      receiptId: 'sk_rcpt_one',
      skillSlug: 'image-gen-pro',
    });

    expect(installSkillsProSkill).toHaveBeenCalledWith(
      'sk_rcpt_one',
      'image-gen-pro',
    );
  });

  it('rejects missing receipt or slug arguments before calling the API', async () => {
    await expect(
      handleSkillsProTool(client, 'verify_skills_pro_entitlement', {}),
    ).rejects.toThrow('receiptId required');
    await expect(
      handleSkillsProTool(client, 'install_skills_pro_skill', {
        receiptId: 'sk_rcpt_one',
      }),
    ).rejects.toThrow('skillSlug required');
  });
});
