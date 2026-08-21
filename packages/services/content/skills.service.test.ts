import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import {
  AgentCampaign,
  AgentCampaignsService,
} from '@services/automation/agent-campaigns.service';
import { Skill, SkillsService } from '@services/content/skills.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const skillInput = {
  category: 'creation',
  channels: ['instagram'],
  description: 'Writes hooks',
  modalities: ['text' as const],
  name: 'Hook writer',
  slug: 'hook-writer',
  workflowStage: 'creation' as const,
};

describe('SkillsService', () => {
  let service: SkillsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SkillsService('skills-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = SkillsService.getInstance('tok');
    expect(SkillsService.getInstance('tok')).toBe(first);
  });

  it('listSkills GETs the collection', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'skill_1', name: 'Hook' }])),
    );

    const result = await service.listSkills();

    expect(http.get).toHaveBeenCalledWith('', {
      params: {},
      signal: undefined,
    });
    expect(result[0]).toBeInstanceOf(Skill);
  });

  it('getSkill GETs one skill', async () => {
    http.get.mockResolvedValue(
      axiosResponse(resourceDocument({ name: 'Hook' }, { id: 'skill_1' })),
    );

    const result = await service.getSkill('skill_1');

    expect(http.get).toHaveBeenCalledWith('/skill_1');
    expect(result.id).toBe('skill_1');
  });

  it('createSkill POSTs the input', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ name: 'Hook' }, { id: 'skill_new' })),
    );

    const result = await service.createSkill(skillInput);

    expect(http.post).toHaveBeenCalledWith('', skillInput);
    expect(result.id).toBe('skill_new');
  });

  it('importSkill POSTs to the import route', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ name: 'Hook' }, { id: 'skill_imp' })),
    );

    const result = await service.importSkill(skillInput);

    expect(http.post).toHaveBeenCalledWith('/import', skillInput);
    expect(result.id).toBe('skill_imp');
  });

  it('customizeSkill POSTs the customization', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ name: 'Custom' }, { id: 'skill_c' })),
    );

    const result = await service.customizeSkill('skill_1', {
      name: 'Custom',
    });

    expect(http.post).toHaveBeenCalledWith('/skill_1/customize', {
      name: 'Custom',
    });
    expect(result.name).toBe('Custom');
  });

  it('updateSkill PATCHes the input', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ name: 'Edit' }, { id: 'skill_1' })),
    );

    await service.updateSkill('skill_1', { description: 'Edited' });

    expect(http.patch).toHaveBeenCalledWith('/skill_1', {
      description: 'Edited',
    });
  });
});

describe('AgentCampaignsService', () => {
  const campaignId = 'campaign_1';
  let service: AgentCampaignsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentCampaignsService('campaigns-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = AgentCampaignsService.getInstance('tok');
    expect(AgentCampaignsService.getInstance('tok')).toBe(first);
  });

  it('list GETs campaigns with a status filter', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: campaignId, label: 'C' }])),
    );

    const result = await service.list({ status: 'active' });

    expect(http.get).toHaveBeenCalledWith('', {
      params: { status: 'active' },
      signal: undefined,
    });
    expect(result[0]).toBeInstanceOf(AgentCampaign);
  });

  it('getById GETs one campaign', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { brandId: 'brand-1', label: 'C' },
          { id: campaignId },
        ),
      ),
    );

    const result = await service.getById(campaignId);

    expect(result).toBeInstanceOf(AgentCampaign);
    expect(result.id).toBe(campaignId);
    expect(result.brandId).toBe('brand-1');
  });

  it('create POSTs the campaign input', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'C' }, { id: 'campaign_new' })),
    );

    const result = await service.create({
      label: 'C',
      startDate: '2026-08-10',
    });

    expect(http.post).toHaveBeenCalledWith('', {
      label: 'C',
      startDate: '2026-08-10',
    });
    expect(result.id).toBe('campaign_new');
  });

  it('update PATCHes the campaign', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'C2' }, { id: campaignId })),
    );

    await service.update(campaignId, { brief: 'New brief' });

    expect(http.patch).toHaveBeenCalledWith(`/${campaignId}`, {
      brief: 'New brief',
    });
  });

  it('remove DELETEs the campaign', async () => {
    http.delete.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'C' }, { id: campaignId })),
    );

    await service.remove(campaignId);

    expect(http.delete).toHaveBeenCalledWith(`/${campaignId}`);
  });

  it('execute and pause PATCH the status', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'C' }, { id: campaignId })),
    );

    await service.execute(campaignId);
    await service.pause(campaignId);

    expect(http.patch).toHaveBeenNthCalledWith(1, `/${campaignId}`, {
      status: 'active',
    });
    expect(http.patch).toHaveBeenNthCalledWith(2, `/${campaignId}`, {
      status: 'paused',
    });
  });

  it('getStatus GETs the raw status payload', async () => {
    const status = { campaignId, progress: 0.5 };
    http.get.mockResolvedValue(axiosResponse(status));

    const result = await service.getStatus(campaignId);

    expect(http.get).toHaveBeenCalledWith(`/${campaignId}/status`);
    expect(result).toEqual(status);
  });
});
