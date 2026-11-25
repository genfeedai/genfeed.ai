import type { BrandKitApprovalDraft } from '@mcp/services/client/brand-kit.client';
import { handleBrandKitTool } from '@mcp/tools/brand-kit.tool';

const unusedApproval = {
  approveDraft: async () => undefined,
  getApprovalDraft: async () => {
    throw new Error('not used');
  },
};

describe('Brand Kit section tool', () => {
  it('reports a successful section update and the fields sent to that section', async () => {
    const updates: unknown[] = [];
    const result = await handleBrandKitTool(
      {
        ...unusedApproval,
        updateSection: async (brandId, section, fields) => {
          updates.push({ brandId, section, fields });
        },
      },
      {
        action: 'strategy',
        brandId: 'brand-1',
        fields: { frequency: 'weekly' },
      },
    );

    expect(updates).toEqual([
      {
        brandId: 'brand-1',
        section: 'strategy',
        fields: { frequency: 'weekly' },
      },
    ]);
    expect(result.structuredContent.data).toEqual({
      action: 'strategy',
      brandId: 'brand-1',
      updatedFields: ['frequency'],
    });
  });

  it('rejects a request that selects an asset operation', async () => {
    await expect(
      handleBrandKitTool(
        { ...unusedApproval, updateSection: async () => undefined },
        {
          action: 'upload_logo',
          brandId: 'brand-1',
          fields: { file: 'logo' },
        },
      ),
    ).rejects.toThrow();
  });

  it('saves the brand name through the identity section', async () => {
    const updates: unknown[] = [];
    const result = await handleBrandKitTool(
      {
        ...unusedApproval,
        updateSection: async (brandId, section, fields) => {
          updates.push({ brandId, section, fields });
        },
      },
      { action: 'identity', brandId: 'brand-1', fields: { label: 'Acme' } },
    );

    expect(updates).toEqual([
      { brandId: 'brand-1', section: 'identity', fields: { label: 'Acme' } },
    ]);
    expect(result.structuredContent.data).toEqual({
      action: 'identity',
      brandId: 'brand-1',
      updatedFields: ['label'],
    });
  });

  describe('approve', () => {
    const draft = {
      description: 'Pasta, daily',
      name: 'Acme',
      needsWebReview: false,
      revisionId: 'rev-1',
      updatedAt: '2026-11-25T10:00:00.000Z',
      version: 3,
    };

    function approvalClient(shown: BrandKitApprovalDraft = draft) {
      const approvals: unknown[] = [];
      return {
        approvals,
        client: {
          approveDraft: async (brandId: string, reviewed: unknown) => {
            approvals.push({ brandId, reviewed });
          },
          getApprovalDraft: async () => shown,
          updateSection: async () => undefined,
        },
      };
    }

    it('approves nothing on the first call and returns the draft to confirm', async () => {
      const { approvals, client } = approvalClient();

      const result = await handleBrandKitTool(client, {
        action: 'approve',
        brandId: 'brand-1',
      });

      expect(approvals).toEqual([]);
      expect(result.structuredContent.data).toMatchObject({
        approved: false,
        draft,
      });
      expect(result.content[0]?.text).toContain('Acme');
      expect(result.content[0]?.text).toContain('confirmed true');
    });

    it('approves the reviewed draft once the person confirmed it', async () => {
      const { approvals, client } = approvalClient();

      const result = await handleBrandKitTool(client, {
        action: 'approve',
        brandId: 'brand-1',
        confirmed: true,
        revisionId: 'rev-1',
        updatedAt: '2026-11-25T10:00:00.000Z',
      });

      expect(approvals).toEqual([
        {
          brandId: 'brand-1',
          reviewed: {
            revisionId: 'rev-1',
            updatedAt: '2026-11-25T10:00:00.000Z',
          },
        },
      ]);
      expect(result.structuredContent.data).toMatchObject({ approved: true });
    });

    it('refuses a confirmation that does not carry the reviewed draft', async () => {
      const { approvals, client } = approvalClient();

      await expect(
        handleBrandKitTool(client, {
          action: 'approve',
          brandId: 'brand-1',
          confirmed: true,
        }),
      ).rejects.toThrow();
      expect(approvals).toEqual([]);
    });

    it('sends a draft with generation rules to the web app instead of offering to confirm', async () => {
      const { client } = approvalClient({ ...draft, needsWebReview: true });

      const result = await handleBrandKitTool(client, {
        action: 'approve',
        brandId: 'brand-1',
      });

      expect(result.content[0]?.text).toContain('web app');
      expect(result.content[0]?.text).not.toContain('confirmed true');
    });

    it('asks for the brand name first when the draft has none', async () => {
      const { client } = approvalClient({ ...draft, name: undefined });

      const result = await handleBrandKitTool(client, {
        action: 'approve',
        brandId: 'brand-1',
      });

      expect(result.content[0]?.text).toContain('action identity');
    });
  });
});
