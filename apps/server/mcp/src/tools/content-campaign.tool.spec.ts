import { handleContentCampaignTool } from './content-campaign.tool';

it('keeps brand context and Library assets on a native campaign create', async () => {
  const campaign = { id: 'campaign-1', brandId: 'brand-1' };
  const client = { manageCampaign: vi.fn().mockResolvedValue(campaign) };
  const input = {
    brandId: 'brand-1',
    name: 'Launch',
    idempotencyKey: 'launch-1',
    audience: 'Teams',
    tone: 'Candid',
    assetIds: ['asset-1'],
  };
  const result = await handleContentCampaignTool(client, 'manage_campaign', {
    action: 'create',
    input,
  });
  expect(client.manageCampaign).toHaveBeenCalledWith({
    action: 'create',
    input,
  });
  expect(result.structuredContent.data).toEqual(campaign);
});

it.each([
  { action: 'get', input: { brandId: 'brand-1' } },
  { action: 'create', input: { brandId: 'brand-1', name: 'Launch' } },
  { action: 'list', input: { brandId: 'brand-1', limit: 10000 } },
  {
    action: 'update',
    input: {
      brandId: 'brand-1',
      campaignId: 'campaign-1',
      assetIds: ['a', 'a'],
    },
  },
  { action: 'start', input: { brandId: 'brand-1', campaignId: 'campaign-1' } },
  {
    action: 'create',
    input: {
      brandId: 'brand-1',
      name: 'Launch',
      idempotencyKey: '1',
      status: 'active',
    },
  },
])(
  'rejects invalid actions without API or publishing side effects: %j',
  async (args) => {
    const client = { manageCampaign: vi.fn() };
    await expect(
      handleContentCampaignTool(client, 'manage_campaign', args),
    ).rejects.toThrow();
    expect(client.manageCampaign).not.toHaveBeenCalled();
  },
);
