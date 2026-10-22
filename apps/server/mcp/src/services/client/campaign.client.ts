import type { ContentCampaignMcpInput } from '@genfeedai/contracts/api-types/contracts/content-campaign.contract';
import { contentCampaignResourceSchema } from '@genfeedai/contracts/api-types/contracts/content-campaign.contract';
import type { ICampaign } from '@genfeedai/contracts/interfaces';
import { z } from 'zod';
import type { BaseApiClient } from './base-api-client';

export class CampaignClient {
  constructor(
    private readonly base: Pick<BaseApiClient, 'request' | 'failWithDetail'>,
  ) {}

  async manage(
    input: ContentCampaignMcpInput,
  ): Promise<ICampaign | ICampaign[]> {
    const { action } = input;
    const resourceSchema = contentCampaignResourceSchema.refine(
      (campaign) => campaign.brandId === input.input.brandId,
      'Campaign is unavailable in this brand.',
    );
    return this.base.request<ICampaign | ICampaign[]>(
      'managing brand campaign',
      async (http) => {
        if (input.action === 'list') {
          const response = await http.get('/campaigns', {
            params: input.input,
          });
          return z
            .object({ data: z.array(resourceSchema) })
            .parse(response.data).data;
        }
        if (input.action === 'create') {
          const response = await http.post('/campaigns', input.input);
          return z.object({ data: resourceSchema }).parse(response.data).data;
        }
        const { campaignId } = input.input;
        const path = `/campaigns/${encodeURIComponent(campaignId)}`;
        const response = await http.get(path);
        const campaign = z
          .object({ data: resourceSchema })
          .parse(response.data).data;
        if (input.action === 'get') return campaign;
        const {
          brandId: _brandId,
          campaignId: _campaignId,
          ...changes
        } = input.input;
        const updated = await http.patch(path, changes);
        return z.object({ data: resourceSchema }).parse(updated.data).data;
      },
      this.base.failWithDetail(`Failed to ${action} campaign`),
    );
  }
}
