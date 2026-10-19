import type { CreateTemplateDto } from '@api/collections/templates/dto/create-template.dto';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dto: CreateTemplateDto = {
  content: 'Hello {{name}}',
  description: 'A greeting',
  label: 'Greeting',
  purpose: 'prompt',
  key: 'greeting',
  tags: ['welcome'],
};

function row(
  config: Record<string, unknown> = {
    content: dto.content,
    description: dto.description,
    tags: dto.tags,
  },
) {
  return {
    id: 'template-1',
    organizationId: 'org-1',
    label: dto.label,
    purpose: dto.purpose,
    key: dto.key,
    config,
    variables: [],
    isDeleted: false,
    isActive: true,
  };
}

describe('TemplatesService persistence', () => {
  const prisma = {
    $transaction: vi.fn(),
    template: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
  const metadata = { create: vi.fn(), update: vi.fn() };
  const usage = { create: vi.fn(), countByTemplate: vi.fn() };
  let service: TemplatesService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    prisma.template.create.mockImplementation(async ({ data }) => {
      for (const field of ['content', 'description', 'tags', 'metadata']) {
        if (field in data)
          throw new Error(`Unknown Template argument: ${field}`);
      }
      return { ...row(), ...data };
    });
    prisma.template.findFirst.mockResolvedValue(row());
    prisma.template.findMany.mockResolvedValue([row()]);
    prisma.template.count.mockResolvedValue(1);
    prisma.template.update.mockImplementation(async ({ data }) => ({
      ...row(),
      ...data,
    }));
    usage.countByTemplate.mockResolvedValue(1);
    service = new TemplatesService(
      prisma as never,
      usage as never,
      metadata as never,
      { debug: vi.fn(), error: vi.fn() } as never,
      {} as never,
      {} as never,
    );
  });

  it('persists content, description and tags in config and returns their public fields', async () => {
    prisma.template.findFirst.mockResolvedValue(null);
    const result = await service.create(dto, 'org-1', 'user-1');
    expect(prisma.template.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: {
          content: dto.content,
          description: dto.description,
          tags: dto.tags,
        },
        organizationId: 'org-1',
        createdById: 'user-1',
      }),
    });
    expect(result).toMatchObject({
      content: dto.content,
      description: dto.description,
      tags: dto.tags,
    });
  });

  it.each(['create', 'update'] as const)(
    'rolls back template writes when %s metadata fails',
    async (operation) => {
      const committed: unknown[] = [];
      const staged: unknown[] = [];
      const tx = {
        template: {
          findFirst: vi.fn().mockResolvedValue(row()),
          create: vi.fn(async ({ data }) => {
            staged.push(data);
            return row();
          }),
          update: vi.fn(async ({ data }) => {
            staged.push(data);
            return row();
          }),
        },
      };
      prisma.$transaction.mockImplementation(async (callback) => {
        const result = await callback(tx);
        committed.push(...staged);
        return result;
      });
      prisma.template.findFirst.mockResolvedValue(null);
      metadata[operation].mockRejectedValue(new Error('metadata unavailable'));
      const request =
        operation === 'create'
          ? service.create(dto, 'org-1', 'user-1')
          : service.update(
              'template-1',
              { description: 'Changed', metadata: { goals: ['educate'] } },
              'org-1',
            );
      await expect(request).rejects.toThrow();
      expect(staged).toHaveLength(1);
      expect(committed).toEqual([]);
      expect(prisma.template[operation]).not.toHaveBeenCalled();
      expect(metadata[operation]).toHaveBeenCalledWith(
        'template-1',
        expect.any(Object),
        tx,
      );
    },
  );

  it('checks prompt keys within the requested organization so overrides can be created', async () => {
    prisma.template.findFirst.mockResolvedValue(null);
    await service.create(dto, 'org-1', 'user-1');
    expect(prisma.template.findFirst).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        key: dto.key,
        organizationId: 'org-1',
        purpose: 'prompt',
      },
    });
  });

  it('preserves saved content and unrelated config when updating only the description', async () => {
    prisma.template.findFirst.mockResolvedValue(
      row({ ...row().config, custom: true }),
    );
    const result = await service.update(
      'template-1',
      { description: 'New description' },
      'org-1',
    );
    expect(prisma.template.update).toHaveBeenCalledWith({
      where: { id: 'template-1', isDeleted: false, organizationId: 'org-1' },
      data: {
        config: {
          ...row().config,
          custom: true,
          description: 'New description',
        },
      },
    });
    expect(result.content).toBe(dto.content);
    expect(result.description).toBe('New description');
  });

  it('updates metadata through its persistence service instead of treating the DTO as a relation input', async () => {
    await service.update(
      'template-1',
      { metadata: { goals: ['educate'] } },
      'org-1',
    );
    expect(metadata.update).toHaveBeenCalledWith(
      'template-1',
      {
        goals: ['educate'],
      },
      prisma,
    );
    expect(prisma.template.update).toHaveBeenCalledWith({
      where: { id: 'template-1', isDeleted: false, organizationId: 'org-1' },
      data: {},
    });
  });

  it('keeps config values the typed columns never received', async () => {
    // Rows imported before the typed columns existed carry category and
    // isActive only inside `config`; the null columns must not shadow them.
    prisma.template.findMany.mockResolvedValue([
      {
        ...row({ category: 'caption', isActive: true }),
        category: null,
        isActive: null,
      },
    ]);

    expect((await service.findAll('org-1')).docs).toEqual([
      expect.objectContaining({ category: 'caption', isActive: true }),
    ]);
  });

  it('lets a stored column win over the config value', async () => {
    prisma.template.findMany.mockResolvedValue([
      {
        ...row({ category: 'caption', isActive: true }),
        category: 'email',
        isActive: false,
      },
    ]);

    expect((await service.findAll('org-1')).docs).toEqual([
      expect.objectContaining({ category: 'email', isActive: false }),
    ]);
  });

  it('hydrates config fields for list and detail reads', async () => {
    expect(await service.findOne('template-1', 'org-1')).toMatchObject({
      content: dto.content,
    });
    expect((await service.findAll('org-1')).docs).toEqual([
      expect.objectContaining({ content: dto.content }),
    ]);
  });

  it('searches description in config without querying a nonexistent column', async () => {
    await service.findAll('org-1', { search: 'greeting' });
    expect(prisma.template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { label: { contains: 'greeting', mode: 'insensitive' } },
            {
              config: {
                path: ['description'],
                string_contains: 'greeting',
                mode: 'insensitive',
              },
            },
          ],
        }),
      }),
    );
  });

  it('keeps searches scoped to the active organization and live templates', async () => {
    await service.findAll('org-1', { search: 'greeting' });
    expect(prisma.template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          isDeleted: false,
        }),
      }),
    );
  });

  it('pages in the database and reports totals', async () => {
    prisma.template.count.mockResolvedValue(45);

    const result = await service.findAll('org-1', { limit: 20, page: 3 });

    expect(prisma.template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 40, take: 20 }),
    );
    expect(result).toMatchObject({
      hasNextPage: false,
      hasPrevPage: true,
      page: 3,
      totalDocs: 45,
      totalPages: 3,
    });
  });

  it('ranks popular templates by usage in the database', async () => {
    await service.findAll('org-1', { sort: 'popular' });

    expect(prisma.template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { usageCount: { nulls: 'last', sort: 'desc' } },
          { createdAt: 'desc' },
        ],
      }),
    );
  });

  it('limits missing-organization reads to global templates', async () => {
    await service.findAll();
    await service.findOne('template-1');
    expect(prisma.template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: null, isDeleted: false },
      }),
    );
    expect(prisma.template.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'template-1', organizationId: null, isDeleted: false },
      }),
    );
  });

  it('scopes the soft-delete write to the organization and live row', async () => {
    await service.remove('template-1', 'org-1');
    expect(prisma.template.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { id: 'template-1', organizationId: 'org-1', isDeleted: false },
    });
  });

  it('renders saved prompt content from config', async () => {
    await expect(
      service.getRenderedPrompt('greeting', { name: 'Vincent' }, 'org-1'),
    ).resolves.toBe('Hello Vincent');
  });

  it('fills persisted content and records use through the public template operation', async () => {
    const result = await service.useTemplate(
      { templateId: 'template-1', variables: { name: 'Vincent' } },
      'org-1',
      'user-1',
    );
    expect(result.generatedContent).toBe('Hello Vincent');
    expect(usage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        generatedContent: 'Hello Vincent',
        template: 'template-1',
        user: 'user-1',
      }),
    );
  });

  it('reports a missing prompt before rendering', async () => {
    prisma.template.findFirst.mockResolvedValue(null);
    await expect(
      service.getRenderedPrompt('missing', {}, 'org-1'),
    ).rejects.toThrow('Template');
  });
});
