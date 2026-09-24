import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
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

describe('SkillsService.exportSkill', () => {
  it('returns the response body instead of the axios response', async () => {
    const service = new SkillsService('export-token');
    const body = {
      contentHash: 'hash-v1',
      instructions: 'version one',
      versionId: 'sv-1',
    };
    const http = installMockHttp(service);
    http.get.mockResolvedValue(axiosResponse(body));

    await expect(service.exportSkill('skill-1')).resolves.toEqual(body);
    expect(http.get).toHaveBeenCalledWith('/skill-1/export');
  });
});
