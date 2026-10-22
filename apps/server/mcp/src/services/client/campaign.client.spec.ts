import type { AxiosInstance } from 'axios';
import axios, { AxiosHeaders } from 'axios';
import { CampaignClient } from './campaign.client';

function setup(brandId = 'brand-1') {
  const attributes = {
    brandId,
    name: 'Launch',
    organizationId: 'org-1',
    userId: 'opaque-user',
    status: 'draft',
    isDeleted: false,
    createdAt: '2026-10-22T12:00:00Z',
    updatedAt: '2026-10-22T12:00:00Z',
    tone: 'Candid',
    assetIds: ['asset-1'],
  };
  const resource = { type: 'campaigns', id: 'campaign-1', attributes };
  const response = {
    data: { data: resource },
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  const http = axios.create();
  const get = vi.spyOn(http, 'get').mockResolvedValue(response);
  const post = vi.spyOn(http, 'post').mockResolvedValue(response);
  const patch = vi.spyOn(http, 'patch').mockResolvedValue(response);
  const base = {
    request: async <T>(
      _operation: string,
      call: (http: AxiosInstance) => Promise<T>,
    ): Promise<T> => call(http),
    failWithDetail: (message: string) => () => {
      throw new Error(message);
    },
  };
  return {
    client: new CampaignClient(base),
    get,
    post,
    patch,
    response,
    resource,
    attributes,
  };
}

it('reads the canonical JSON:API campaign attributes and preserves the resource ID', async () => {
  const { client, attributes } = setup();
  expect(
    await client.manage({
      action: 'get',
      input: { brandId: 'brand-1', campaignId: 'campaign-1' },
    }),
  ).toMatchObject({ id: 'campaign-1', ...attributes });
});

it('normalizes created campaigns without publishing', async () => {
  const { client, patch } = setup();
  expect(
    await client.manage({
      action: 'create',
      input: { brandId: 'brand-1', name: 'Launch', idempotencyKey: 'launch-1' },
    }),
  ).toMatchObject({ id: 'campaign-1', brandId: 'brand-1', tone: 'Candid' });
  expect(patch).not.toHaveBeenCalled();
});

it('updates only after reading a campaign in the requested brand', async () => {
  const { client, patch } = setup();
  await client.manage({
    action: 'update',
    input: { brandId: 'brand-1', campaignId: 'campaign-1', tone: 'Precise' },
  });
  expect(patch).toHaveBeenCalledWith('/campaigns/campaign-1', {
    tone: 'Precise',
  });
});

it('does not mutate a campaign from a different brand', async () => {
  const { client, patch } = setup('other-brand');
  await expect(
    client.manage({
      action: 'update',
      input: { brandId: 'brand-1', campaignId: 'campaign-1', tone: 'Precise' },
    }),
  ).rejects.toThrow('unavailable');
  expect(patch).not.toHaveBeenCalled();
});

it('normalizes listed campaigns from the canonical collection envelope', async () => {
  const { client, get, response, resource } = setup();
  get.mockResolvedValue({ ...response, data: { data: [resource] } });
  expect(
    await client.manage({ action: 'list', input: { brandId: 'brand-1' } }),
  ).toEqual([
    expect.objectContaining({ id: 'campaign-1', brandId: 'brand-1' }),
  ]);
});

it('rejects out-of-brand rows in a campaign list', async () => {
  const { client, get, response, resource } = setup('other-brand');
  get.mockResolvedValue({ ...response, data: { data: [resource] } });
  await expect(
    client.manage({ action: 'list', input: { brandId: 'brand-1' } }),
  ).rejects.toThrow('unavailable');
});
