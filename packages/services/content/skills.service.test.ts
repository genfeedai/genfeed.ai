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

describe('SkillsService strict immutable version reads', () => {
  function resource(versionNumber = 3) {
    return {
      type: 'skill-version',
      id: `sv1_skill-1_${versionNumber}`,
      attributes: {
        versionNumber,
        createdAt: '2026-10-02T10:20:30.000Z',
        contentHash: `sha256:skill-v1:${'a'.repeat(64)}`,
      },
    };
  }
  function page() {
    return {
      data: [resource(3), resource(2)],
      links: {
        self: '/api/v1/skills/skill-1/versions?limit=2',
        cursor: { limit: 2, hasMore: true, nextCursor: 2 },
      },
    };
  }
  function alteredMetadata(row: unknown) {
    return { ...page(), data: [row, resource(2)] };
  }
  it('reads allowlisted raw metadata and explicit empty/whitespace/literal instruction snapshots without Skill deserialization', async () => {
    const service = new SkillsService('fixture');
    const http = installMockHttp(service);
    http.get.mockResolvedValueOnce(axiosResponse(page()));
    const result = await service.listSkillVersions('skill-1', { limit: 2 });
    expect(result).toEqual({
      items: page().data.map((row) => ({ id: row.id, ...row.attributes })),
      limit: 2,
      hasMore: true,
      nextCursor: 2,
    });
    expect(result.items[0]).not.toBeInstanceOf(Skill);
    expect(http.get).toHaveBeenCalledWith('/skill-1/versions', {
      params: { limit: 2 },
    });
    for (const instructionText of [
      '',
      ' \n\t ',
      '<script>PRIVATE_LITERAL</script>',
    ]) {
      http.get.mockResolvedValueOnce(
        axiosResponse({
          data: {
            ...resource(),
            attributes: { ...resource().attributes, instructionText },
          },
          links: { self: '/skills/skill-1/versions/sv1_skill-1_3' },
        }),
      );
      expect(await service.getSkillVersion('skill-1', 'sv1_skill-1_3')).toEqual(
        { id: resource().id, ...resource().attributes, instructionText },
      );
    }
  });
  it('accepts limit-one advancing continuation and a terminal empty page with default effective limit', async () => {
    const service = new SkillsService('fixture');
    const http = installMockHttp(service);
    http.get.mockResolvedValueOnce(
      axiosResponse({
        ...page(),
        data: [resource(2)],
        links: {
          ...page().links,
          cursor: { limit: 1, hasMore: true, nextCursor: 2 },
        },
      }),
    );
    expect(
      (
        await service.listSkillVersions('skill-1', {
          limit: 1,
          beforeVersionNumber: 3,
        })
      ).nextCursor,
    ).toBe(2);
    http.get.mockResolvedValueOnce(
      axiosResponse({
        data: [],
        links: {
          self: '/skills/skill-1/versions',
          cursor: { limit: 20, hasMore: false, nextCursor: null },
        },
      }),
    );
    expect((await service.listSkillVersions('skill-1')).items).toEqual([]);
  });
  it.each([
    { ...page(), included: [] },
    { ...page(), meta: {} },
    alteredMetadata({ ...resource(), relationships: {} }),
    alteredMetadata({ ...resource(), links: {} }),
    alteredMetadata({ ...resource(), type: 'skills' }),
    alteredMetadata({ ...resource(), id: 'sv1_foreign_3' }),
    alteredMetadata({
      ...resource(),
      attributes: { ...resource().attributes, versionNumber: 3.5 },
    }),
    alteredMetadata({
      ...resource(),
      attributes: {
        ...resource().attributes,
        contentHash: `sha256:skill-v1:${'A'.repeat(64)}`,
      },
    }),
    alteredMetadata({
      ...resource(),
      attributes: {
        ...resource().attributes,
        contentHash: `${resource().attributes.contentHash}\n`,
      },
    }),
    alteredMetadata({
      ...resource(),
      attributes: {
        ...resource().attributes,
        createdAt: '2026-10-02T10:20:30+00:00',
      },
    }),
    alteredMetadata({
      ...resource(),
      attributes: {
        ...resource().attributes,
        createdAt: '2026-02-30T10:20:30.000Z',
      },
    }),
    {
      ...page(),
      data: [resource(2), resource(3)],
      links: {
        ...page().links,
        cursor: { limit: 2, hasMore: true, nextCursor: 3 },
      },
    },
    {
      ...page(),
      data: [resource(3), resource(3)],
      links: {
        ...page().links,
        cursor: { limit: 2, hasMore: true, nextCursor: 3 },
      },
    },
    {
      ...page(),
      links: {
        ...page().links,
        cursor: { limit: 3, hasMore: true, nextCursor: 2 },
      },
    },
    {
      ...page(),
      links: {
        ...page().links,
        cursor: { limit: 2, hasMore: true, nextCursor: 3 },
      },
    },
    {
      ...page(),
      links: {
        ...page().links,
        cursor: { limit: 2, hasMore: false, nextCursor: 2 },
      },
    },
    {
      ...page(),
      links: {
        ...page().links,
        cursor: { limit: 2, hasMore: true, nextCursor: null },
      },
    },
    {
      ...page(),
      links: {
        ...page().links,
        cursor: { limit: 2, hasMore: 'true', nextCursor: 2 },
      },
    },
    {
      ...page(),
      links: {
        ...page().links,
        cursor: { limit: 2, hasMore: true, nextCursor: '2' },
      },
    },
    {
      ...page(),
      links: {
        ...page().links,
        cursor: { limit: 2, hasMore: true, nextCursor: 2, payload: {} },
      },
    },
    { ...page(), links: { ...page().links, unknown: 'PRIVATE_RAW' } },
    { ...page(), links: { ...page().links, self: null } },
    { ...page(), data: [resource(3), resource(2), resource(1)] },
    {
      ...page(),
      data: [],
      links: {
        ...page().links,
        cursor: { limit: 2, hasMore: true, nextCursor: 2 },
      },
    },
  ])(
    'rejects malformed metadata/pagination without partial results or retries',
    async (wire) => {
      const service = new SkillsService('fixture');
      const http = installMockHttp(service);
      http.get.mockResolvedValue(axiosResponse(wire));
      await expect(
        service.listSkillVersions('skill-1', { limit: 2 }),
      ).rejects.toMatchObject({ message: 'Skill versions are unavailable.' });
      expect(http.get).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    'payload',
    'instructionText',
    'instructionHash',
    'createdById',
    'instructionSourceField',
    'instructionUsable',
    'format',
    'skillId',
    'importProvenance',
    'config',
  ])('rejects protected metadata attribute %s', async (field) => {
    const service = new SkillsService('fixture');
    const http = installMockHttp(service);
    http.get.mockResolvedValue(
      axiosResponse(
        alteredMetadata({
          ...resource(),
          attributes: { ...resource().attributes, [field]: 'PRIVATE_RAW' },
        }),
      ),
    );
    await expect(
      service.listSkillVersions('skill-1', { limit: 2 }),
    ).rejects.toMatchObject({ message: 'Skill versions are unavailable.' });
  });
  it('rejects request cursor violations, wrong detail identity and protected detail fields with the same sanitized denial', async () => {
    const service = new SkillsService('fixture');
    const http = installMockHttp(service);
    http.get.mockResolvedValueOnce(axiosResponse(page()));
    await expect(
      service.listSkillVersions('skill-1', {
        limit: 2,
        beforeVersionNumber: 3,
      }),
    ).rejects.toMatchObject({ message: 'Skill versions are unavailable.' });
    for (const data of [
      {
        ...resource(2),
        attributes: { ...resource(2).attributes, instructionText: '' },
      },
      {
        ...resource(),
        attributes: {
          ...resource().attributes,
          instructionText: '',
          payload: 'PRIVATE_RAW',
        },
      },
      {
        ...resource(),
        attributes: { ...resource().attributes, instructionText: null },
      },
    ]) {
      http.get.mockResolvedValueOnce(
        axiosResponse({
          data,
          links: { self: '/skills/skill-1/versions/sv1_skill-1_3' },
        }),
      );
      await expect(
        service.getSkillVersion('skill-1', 'sv1_skill-1_3'),
      ).rejects.toMatchObject({ message: 'Skill versions are unavailable.' });
    }
    http.get.mockRejectedValueOnce({
      status: 404,
      detail: 'PRIVATE_RAW_DENIAL',
    });
    const error = await service
      .getSkillVersion('skill-1', 'sv1_skill-1_3')
      .catch((failure: unknown) => failure);
    expect(error).toMatchObject({ message: 'Skill versions are unavailable.' });
    expect(error).not.toHaveProperty('cause');
    expect(JSON.stringify(error)).not.toContain('PRIVATE_RAW');
  });
  it.each([
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { limit: Number.NaN },
    { beforeVersionNumber: 0 },
    { beforeVersionNumber: 2147483648 },
    { limit: 20, organizationId: 'foreign' },
  ])('rejects invalid feature queries before dispatch', async (query) => {
    const service = new SkillsService('fixture');
    const http = installMockHttp(service);
    await expect(
      service.listSkillVersions('skill-1', query),
    ).rejects.toMatchObject({ message: 'Skill versions are unavailable.' });
    expect(http.get).not.toHaveBeenCalled();
  });
  it.each([
    'payload',
    'config',
    'importProvenance',
    'instructionHash',
    'createdById',
    'format',
    'skillId',
    'instructionSourceField',
    'instructionUsable',
  ])('rejects protected detail attribute %s', async (field) => {
    const service = new SkillsService('fixture');
    const http = installMockHttp(service);
    http.get.mockResolvedValue(
      axiosResponse({
        data: {
          ...resource(),
          attributes: {
            ...resource().attributes,
            instructionText: '',
            [field]: 'PRIVATE_RAW',
          },
        },
        links: { self: '/skills/skill-1/versions/sv1_skill-1_3' },
      }),
    );
    await expect(
      service.getSkillVersion('skill-1', 'sv1_skill-1_3'),
    ).rejects.toMatchObject({ message: 'Skill versions are unavailable.' });
    expect(http.get).toHaveBeenCalledTimes(1);
  });
  it.each([
    'sv1_foreign_3',
    'sv1_skill-1_03',
    'sv1_skill-1_3\n',
    'sv1_skill-1_2147483648',
  ])(
    'rejects malformed requested version %j before HTTP',
    async (versionId) => {
      const service = new SkillsService('fixture');
      const http = installMockHttp(service);
      await expect(
        service.getSkillVersion('skill-1', versionId),
      ).rejects.toMatchObject({ message: 'Skill versions are unavailable.' });
      expect(http.get).not.toHaveBeenCalled();
    },
  );
  it('accepts the maximum bounded page without accumulating hidden evidence', async () => {
    const service = new SkillsService('fixture');
    const http = installMockHttp(service);
    http.get.mockResolvedValue(
      axiosResponse({
        data: Array.from({ length: 50 }, (_, index) => resource(100 - index)),
        links: {
          self: '/skills/skill-1/versions?limit=50',
          cursor: { limit: 50, hasMore: true, nextCursor: 51 },
        },
      }),
    );
    expect(
      (await service.listSkillVersions('skill-1', { limit: 50 })).items,
    ).toHaveLength(50);
  });
});

describe('SkillsService versions scoped HTTP transport', () => {
  it('uses only explicit version query fields, encodes identities, preserves actor/organization headers and does not follow self links', async () => {
    const metadata = {
      type: 'skill-version',
      id: 'sv1_skill-1_2',
      attributes: {
        versionNumber: 2,
        createdAt: '2026-10-02T10:20:30.000Z',
        contentHash: `sha256:skill-v1:${'a'.repeat(64)}`,
      },
    };
    const adapter = vi.fn<AxiosAdapter>(async (config) => ({
      config,
      data: config.url?.endsWith('/versions')
        ? {
            data: [metadata],
            links: {
              self: 'https://inert.example.test/path',
              cursor: { limit: 1, hasMore: true, nextCursor: 2 },
            },
          }
        : {
            data: {
              ...metadata,
              attributes: { ...metadata.attributes, instructionText: '' },
            },
            links: { self: '/api/v1/skills/skill-1/versions/sv1_skill-1_2' },
          },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    const create = axios.create.bind(axios);
    const spy = vi
      .spyOn(axios, 'create')
      .mockImplementation((config) => create({ ...config, adapter }));
    setRequestOrganizationId('org-versions');
    try {
      const service = SkillsService.forOrganization(
        'versions-token',
        'org-versions',
      );
      await service.listSkillVersions('skill-1', {
        limit: 1,
        beforeVersionNumber: 3,
      });
      await service.getSkillVersion('skill-1', 'sv1_skill-1_2');
      expect(adapter).toHaveBeenCalledTimes(2);
      expect(adapter.mock.calls[0][0].url).toBe('/skill-1/versions');
      expect(adapter.mock.calls[0][0].params).toEqual({
        limit: 1,
        beforeVersionNumber: 3,
      });
      expect(adapter.mock.calls[1][0].url).toBe(
        '/skill-1/versions/sv1_skill-1_2',
      );
      expect(adapter.mock.calls[1][0].params).toBeUndefined();
      for (const [config] of adapter.mock.calls) {
        expect(config.headers[ORGANIZATION_CONTEXT_HEADER]).toBe(
          'org-versions',
        );
        expect(config.headers.Authorization).toBe('Bearer versions-token');
      }
      setRequestOrganizationId('org-other');
      await expect(
        service.getSkillVersion('skill-1', 'sv1_skill-1_2'),
      ).rejects.toMatchObject({ message: 'Skill versions are unavailable.' });
      expect(adapter).toHaveBeenCalledTimes(2);
    } finally {
      clearRequestOrganizationId();
      spy.mockRestore();
    }
  });
});
