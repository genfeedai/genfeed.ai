import { ContentCampaignStatus } from '@genfeedai/contracts';
import { contentCampaignResourceSchema } from '@genfeedai/contracts/api-types/contracts/content-campaign.contract';
import { campaignAttributes } from '@serializers/attributes/content/campaign.attributes';
import { CampaignSerializer } from '@serializers/server/content/campaign.serializer';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

type SerializedCampaign = {
  data: {
    attributes: Record<string, unknown>;
    id: string;
    type: string;
  };
};

describe('CampaignSerializer publish content-campaign contract', () => {
  it('round-trips creative context and Library membership through the real MCP wire schema', () => {
    const serialized = CampaignSerializer.serialize({
      id: 'campaign-wire',
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'opaque-user',
      name: 'Launch',
      status: ContentCampaignStatus.DRAFT,
      isDeleted: false,
      createdAt: new Date('2026-10-22T12:00:00Z'),
      updatedAt: new Date('2026-10-22T12:00:00Z'),
      audience: 'Small teams',
      tone: 'Candid',
      creativeDirection: 'Show the fixes',
      assetIds: ['asset-1'],
      brief: null,
      objective: null,
      startDate: null,
      endDate: null,
    });
    const wire: unknown = JSON.parse(JSON.stringify(serialized));
    const envelope = z
      .object({ data: contentCampaignResourceSchema })
      .parse(wire);
    expect(envelope.data).toMatchObject({
      id: 'campaign-wire',
      brandId: 'brand-1',
      audience: 'Small teams',
      tone: 'Candid',
      creativeDirection: 'Show the fixes',
      assetIds: ['asset-1'],
      createdAt: '2026-10-22T12:00:00.000Z',
      brief: null,
    });
  });

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
    }) as SerializedCampaign;

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
    }) as SerializedCampaign;

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
