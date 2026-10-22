import type { ContentCampaignMcpInput } from '@genfeedai/contracts/api-types/contracts/content-campaign.contract';
import type { ICampaign } from '@genfeedai/contracts/interfaces';
import type { BaseApiClient } from './base-api-client';

export class CampaignClient {
  constructor(private readonly base: BaseApiClient) {}

  async manage(
    input: ContentCampaignMcpInput,
  ): Promise<ICampaign | ICampaign[]> {
    const { action } = input;
    return this.base.request(
      'managing brand campaign',
      async (http) => {
        if (input.action === 'list') {
          const response = await http.get('/campaigns', {
            params: input.input,
          });
          return this.base.unwrapList<ICampaign>(response);
        }
        if (input.action === 'create') {
          const response = await http.post('/campaigns', input.input);
          return this.base.unwrapObject<ICampaign>(response);
        }
        const { brandId, campaignId } = input.input;
        const path = `/campaigns/${encodeURIComponent(campaignId)}`;
        const response = await http.get(path);
        const campaign = this.base.unwrapObject<ICampaign>(response);
        if (campaign.brandId !== brandId)
          throw new Error('Campaign is unavailable in this brand.');
        if (input.action === 'get') return campaign;
        const {
          brandId: _brandId,
          campaignId: _campaignId,
          ...changes
        } = input.input;
        const updated = await http.patch(path, changes);
        return this.base.unwrapObject<ICampaign>(updated);
      },
      this.base.failWithDetail(`Failed to ${action} campaign`),
    );
  }
}
