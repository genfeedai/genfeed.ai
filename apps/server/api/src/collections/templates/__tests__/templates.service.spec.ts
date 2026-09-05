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
    template: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const metadata = { create: vi.fn(), update: vi.fn() };
  const usage = { create: vi.fn(), countByTemplate: vi.fn() };
  let service: TemplatesService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.template.create.mockImplementation(async ({ data }) => {
      for (const field of ['content', 'description', 'tags', 'metadata']) {
        if (field in data)
          throw new Error(`Unknown Template argument: ${field}`);
      }
      return { ...row(), ...data };
    });
    prisma.template.findFirst.mockResolvedValue(row());
    prisma.template.findMany.mockResolvedValue([row()]);
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
      where: { id: 'template-1' },
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
    expect(metadata.update).toHaveBeenCalledWith('template-1', {
      goals: ['educate'],
    });
    expect(prisma.template.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: {},
    });
  });

  it('hydrates config fields for list and detail reads', async () => {
    expect(await service.findOne('template-1', 'org-1')).toMatchObject({
      content: dto.content,
    });
    expect(await service.findAll('org-1')).toEqual([
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
