import { handleBrandKitTool } from '@mcp/tools/brand-kit.tool';

describe('Brand Kit section tool', () => {
  it('reports a successful section update and the fields sent to that section', async () => {
    const updates: unknown[] = [];
    const result = await handleBrandKitTool(
      {
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
    expect(result.structuredContent).toEqual({
      action: 'strategy',
      brandId: 'brand-1',
      updatedFields: ['frequency'],
    });
  });

  it('rejects a request that selects an asset operation', async () => {
    await expect(
      handleBrandKitTool(
        { updateSection: async () => undefined },
        {
          action: 'upload_logo',
          brandId: 'brand-1',
          fields: { file: 'logo' },
        },
      ),
    ).rejects.toThrow();
  });
});
