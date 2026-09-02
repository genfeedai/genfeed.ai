import { ContentCampaignStatus } from '@genfeedai/enums';
import { campaignAttributes } from '@serializers/attributes/content/campaign.attributes';
import { CampaignSerializer } from '@serializers/server/content/campaign.serializer';
import { describe, expect, it } from 'vitest';

describe('CampaignSerializer publish content-campaign contract', () => {
  it('serializes the campaign brief, window, and scope without relations', () => {
    const output = CampaignSerializer.serialize({
      brandId: 'brand-1',
      brief: 'One reveal beat, three proof shots, no voiceover.',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      endDate: '2026-10-31T23:59:59.000Z',
      id: 'campaign-1',
      isDeleted: false,
      name: 'Autumn Product Reveal',
      objective: 'Drive 1,000 trial signups from short-form video.',
      organizationId: 'org-1',
      startDate: '2026-09-15T00:00:00.000Z',
      status: ContentCampaignStatus.SCHEDULED,
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      userId: 'opaque-user',
    }) as {
      data: {
        attributes: Record<string, unknown>;
        id: string;
        type: string;
      };
    };

    expect(campaignAttributes).toEqual(
      expect.arrayContaining([
        'brandId',
        'brief',
        'createdAt',
        'endDate',
        'isDeleted',
        'name',
        'objective',
        'organizationId',
        'startDate',
        'status',
        'updatedAt',
        'userId',
      ]),
    );
    expect(output.data.id).toBe('campaign-1');
    expect(output.data.type).toBe('campaign');
    expect(output.data.attributes).toMatchObject({
      brandId: 'brand-1',
      brief: 'One reveal beat, three proof shots, no voiceover.',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      endDate: '2026-10-31T23:59:59.000Z',
      isDeleted: false,
      name: 'Autumn Product Reveal',
      objective: 'Drive 1,000 trial signups from short-form video.',
      organizationId: 'org-1',
      startDate: '2026-09-15T00:00:00.000Z',
      status: 'scheduled',
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      userId: 'opaque-user',
    });
  });

  it('keeps nullable brief, objective, and campaign window on the wire', () => {
    const output = CampaignSerializer.serialize({
      brandId: 'brand-1',
      brief: null,
      endDate: null,
      id: 'campaign-2',
      isDeleted: false,
      name: 'Untitled Campaign',
      objective: null,
      organizationId: 'org-1',
      startDate: null,
      status: ContentCampaignStatus.DRAFT,
      userId: 'opaque-user',
    }) as { data: { attributes: Record<string, unknown>; id: string } };

    expect(output.data.id).toBe('campaign-2');
    expect(output.data.attributes).toMatchObject({
      brief: null,
      endDate: null,
      objective: null,
      startDate: null,
      status: 'draft',
    });
  });
});
