import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
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
import {
  classifySkillImportFailure,
  Skill,
  SkillImportCreatedUnavailableError,
  SkillImportRejectedError,
  SkillsService,
} from '@services/content/skills.service';
import {
  clearRequestOrganizationId,
  setRequestOrganizationId,
} from '@services/core/interceptor.service';
import axios, { type AxiosAdapter } from 'axios';
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

    const envelope = {
      slug: 'hook-writer',
      package: {
        format: 'files' as const,
        files: [
          {
            path: 'SKILL.md',
            content:
              '---\nname: Hook writer\ndescription: Hooks\n---\nInstructions',
          },
        ],
      },
    };
    const result = await service.importSkill(envelope);

    expect(http.post).toHaveBeenCalledWith('/import', envelope);
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

describe('SkillsService canonical fork and scoped acquisition', () => {
  it('POSTs an empty payload to an encoded canonical fork route and maps JSONAPI', async () => {
    const service = new SkillsService('fork-fixture');
    const http = installMockHttp(service);
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ name: 'Own fork' }, { id: 'fork-1' })),
    );
    expect(await service.forkSkill('skill/one')).toBeInstanceOf(Skill);
    expect(http.post).toHaveBeenCalledWith('/skill%2Fone/fork', {});
    expect(http.post).not.toHaveBeenCalledWith(
      expect.stringContaining('/customize'),
      expect.anything(),
    );
  });
  it('creates fresh instances and rejects a previously bound organization after A to B to A', () => {
    setRequestOrganizationId('org-a');
    try {
      const service = SkillsService.forOrganization('scope-fixture', 'org-a');
      const headers = service as unknown as {
        requestOrganizationHeaders: () => Record<string, string>;
      };
      expect(headers.requestOrganizationHeaders()).toBeTruthy();
      expect(SkillsService.forOrganization('scope-fixture', 'org-a')).not.toBe(
        service,
      );
      setRequestOrganizationId('org-b');
      setRequestOrganizationId('org-a');
      expect(() => headers.requestOrganizationHeaders()).toThrow(
        'no longer confirmed',
      );
    } finally {
      clearRequestOrganizationId();
    }
  });
});

describe('SkillsService validated import transport', () => {
  it.each([
    {
      slug: 'upload',
      package: {
        format: 'files' as const,
        files: [{ path: 'SKILL.md', content: 'Original contents' }],
      },
    },
    {
      slug: 'upload',
      expectedPackageChecksum: 'a'.repeat(64),
      sourceUrl: 'https://example.com/package',
      package: { format: 'zip' as const, archiveBase64: 'UEs=' },
    },
  ])(
    'sends the exact envelope with the bound organization and token through the real interceptor',
    async (input) => {
      const adapter = vi.fn<AxiosAdapter>(async (config) => ({
        config,
        data: resourceDocument({ name: 'Imported' }, { id: 'imported-1' }),
        headers: {},
        status: 201,
        statusText: 'Created',
      }));
      const create = axios.create.bind(axios);
      const spy = vi
        .spyOn(axios, 'create')
        .mockImplementation((config) => create({ ...config, adapter }));
      setRequestOrganizationId('org-import');
      try {
        const service = SkillsService.forOrganization(
          'import-token',
          'org-import',
        );
        expect((await service.importSkill(input)).id).toBe('imported-1');
        const config = adapter.mock.calls[0][0];
        expect(config.url).toBe('/import');
        expect(JSON.parse(config.data)).toEqual(input);
        expect(config.headers[ORGANIZATION_CONTEXT_HEADER]).toBe('org-import');
        expect(config.headers.Authorization).toBe('Bearer import-token');
        setRequestOrganizationId('org-other');
        await expect(service.importSkill(input)).rejects.toMatchObject({
          isCancelled: true,
        });
        expect(adapter).toHaveBeenCalledTimes(1);
      } finally {
        clearRequestOrganizationId();
        spy.mockRestore();
      }
    },
  );
  it('marks successful creation with a malformed resource as unavailable without a second POST', async () => {
    const service = new SkillsService('fixture');
    const http = installMockHttp(service);
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ name: 'Missing ID' }, { id: '' })),
    );
    await expect(
      service.importSkill({
        slug: 'upload',
        package: { format: 'files', files: [] },
      }),
    ).rejects.toMatchObject({ name: 'SkillImportCreatedUnavailableError' });
    expect(http.post).toHaveBeenCalledTimes(1);
  });
});

describe('validated import safe error classification', () => {
  it.each([400, 401, 403, 409, 422, 429])(
    'classifies known pre-write status %s without retaining private response data',
    async (status) => {
      const service = new SkillsService('fixture');
      const http = installMockHttp(service);
      const failure = {
        errors: [
          { status: String(status), detail: 'PRIVATE_VALIDATION_CONTEXT' },
        ],
      };
      http.post.mockRejectedValue(failure);
      await expect(
        service.importSkill({
          slug: 'upload',
          package: { format: 'files', files: [] },
        }),
      ).rejects.toBeInstanceOf(SkillImportRejectedError);
      const classified = classifySkillImportFailure(failure);
      expect(classified).not.toHaveProperty('cause');
      expect(JSON.stringify(classified)).not.toContain(
        'PRIVATE_VALIDATION_CONTEXT',
      );
      expect(http.post).toHaveBeenCalledTimes(1);
    },
  );
  it('recognizes only the exact canonical post-write 403 marker', () => {
    const exact =
      'Skill import was created, but details are unavailable. Refresh the skill library.';
    expect(
      classifySkillImportFailure({
        errors: [{ status: '403', detail: exact }],
      }),
    ).toBeInstanceOf(SkillImportCreatedUnavailableError);
    expect(
      classifySkillImportFailure({ statusCode: 403, message: exact }),
    ).toBeInstanceOf(SkillImportCreatedUnavailableError);
    expect(
      classifySkillImportFailure({
        statusCode: 403,
        message: `${exact} PRIVATE_EXTRA`,
      }),
    ).toBeInstanceOf(SkillImportRejectedError);
    expect(
      classifySkillImportFailure({ statusCode: 500, message: exact }),
    ).toBeNull();
    expect(
      classifySkillImportFailure(new Error('created unavailable')),
    ).toBeNull();
  });
});
