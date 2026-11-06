import type { ModelsService } from '@api/collections/models/services/models.service';
import { TemplateMetadataService } from '@api/collections/template-metadata/services/template-metadata.service';
import type { TemplateUsageService } from '@api/collections/template-usage/services/template-usage.service';
import type { CreateTemplateDto } from '@api/collections/templates/dto/create-template.dto';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
type OrderBy = Record<string, 'asc' | 'desc' | { nulls: 'last'; sort: 'desc' }>;

const dto: CreateTemplateDto = {
  content: 'Hello {{name}}',
  description: 'A greeting',
  label: 'Greeting',
  purpose: 'prompt',
  key: 'greeting',
  tags: ['welcome'],
};

/** Prisma `where` over scalars, AND/OR, insensitive contains, JSON paths and hasSome. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === 'AND') {
      return (condition as Where[]).every((part) => matches(row, part));
    }
    if (key === 'OR') {
      return (condition as Where[]).some((part) => matches(row, part));
    }
    const value = row[key];
    if (condition === null || typeof condition !== 'object') {
      return value === condition;
    }
    const filter = condition as Row;
    if ('contains' in filter) {
      return (
        typeof value === 'string' &&
        value.toLowerCase().includes(String(filter.contains).toLowerCase())
      );
    }
    if ('path' in filter) {
      const nested = (filter.path as string[]).reduce<unknown>(
        (current, segment) => (current as Row | undefined)?.[segment],
        value,
      );
      return (
        typeof nested === 'string' &&
        nested
          .toLowerCase()
          .includes(String(filter.string_contains).toLowerCase())
      );
    }
    if ('hasSome' in filter) {
      return (
        Array.isArray(value) &&
        (filter.hasSome as unknown[]).some((item) => value.includes(item))
      );
    }
    throw new Error(`Unsupported filter on ${key}`);
  });
}

/** Prisma `data` with scalar sets and `{ increment }`. */
function apply(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    row[key] =
      value !== null && typeof value === 'object' && 'increment' in value
        ? Number(row[key] ?? 0) + Number(value.increment)
        : value;
  }
}

function compare(left: Row, right: Row, orderBy: OrderBy[]): number {
  for (const order of orderBy) {
    const [field, direction] = Object.entries(order)[0];
    const sort = typeof direction === 'string' ? direction : direction.sort;
    const a = left[field] as number | Date | null | undefined;
    const b = right[field] as number | Date | null | undefined;
    if (a === b) continue;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    const delta = Number(a) - Number(b);
    if (delta !== 0) return sort === 'desc' ? -delta : delta;
  }
  return 0;
}

const UNKNOWN_TEMPLATE_COLUMNS = ['content', 'description', 'tags', 'metadata'];

interface State {
  metadata: Row[];
  templates: Row[];
}

/**
 * The template and template_metadata tables behind a Prisma-shaped client.
 * `$transaction` stages writes on a copy and commits them only when the
 * callback resolves, so a failed write inside it leaves the tables untouched.
 */
function createDatabase(state: State, failures: { metadata?: Error }) {
  let clock = 0;
  const client = (tables: State) => {
    const withMetadata = (row: Row, include?: { metadata?: boolean }) =>
      include?.metadata
        ? {
            ...row,
            metadata:
              tables.metadata.find(
                (meta) => meta.templateId === row.id && !meta.isDeleted,
              ) ?? null,
          }
        : { ...row };
    return {
      template: {
        count: async ({ where }: { where: Where }) =>
          tables.templates.filter((row) => matches(row, where)).length,
        create: async ({ data }: { data: Row }) => {
          for (const column of UNKNOWN_TEMPLATE_COLUMNS) {
            if (column in data) {
              throw new Error(`Unknown Template argument: ${column}`);
            }
          }
          clock += 1;
          const row: Row = {
            category: null,
            createdAt: new Date(clock),
            id: `template-new-${clock}`,
            isActive: null,
            isDeleted: false,
            usageCount: 0,
          };
          apply(row, data);
          tables.templates.push(row);
          return { ...row };
        },
        findFirst: async ({
          include,
          where,
        }: {
          include?: { metadata?: boolean };
          where: Where;
        }) => {
          const row = tables.templates.find((item) => matches(item, where));
          return row ? withMetadata(row, include) : null;
        },
        findMany: async (args: {
          include?: { metadata?: boolean };
          orderBy: OrderBy | OrderBy[];
          skip: number;
          take: number;
          where: Where;
        }) =>
          tables.templates
            .filter((row) => matches(row, args.where))
            .sort((a, b) =>
              compare(
                a,
                b,
                Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy],
              ),
            )
            .slice(args.skip, args.skip + args.take)
            .map((row) => withMetadata(row, args.include)),
        update: async ({ data, where }: { data: Row; where: Where }) => {
          const row = tables.templates.find((item) => matches(item, where));
          if (!row) throw new Error('Record to update not found.');
          apply(row, data);
          return { ...row };
        },
      },
      templateMetadata: {
        create: async ({ data }: { data: Row }) => {
          if (failures.metadata) throw failures.metadata;
          const row = { id: `metadata-${data.templateId}`, ...data };
          tables.metadata.push(row);
          return { ...row };
        },
        findFirst: async ({ where }: { where: Where }) =>
          tables.metadata.find((row) => matches(row, where)) ?? null,
        update: async ({ data, where }: { data: Row; where: Where }) => {
          if (failures.metadata) throw failures.metadata;
          const row = tables.metadata.find((item) => matches(item, where));
          if (!row) throw new Error('Record to update not found.');
          apply(row, data);
          return { ...row };
        },
      },
    };
  };

  return {
    ...client(state),
    $transaction: async <T>(
      work: (tx: ReturnType<typeof client>) => Promise<T>,
    ): Promise<T> => {
      const staged: State = structuredClone(state);
      const result = await work(client(staged));
      state.templates.splice(0, state.templates.length, ...staged.templates);
      state.metadata.splice(0, state.metadata.length, ...staged.metadata);
      return result;
    },
  };
}

function templateRow(overrides: Row = {}): Row {
  return {
    category: null,
    config: {
      content: dto.content,
      description: dto.description,
      tags: dto.tags,
    },
    createdAt: new Date(0),
    id: 'template-1',
    isActive: true,
    isDeleted: false,
    key: dto.key,
    label: dto.label,
    organizationId: 'org-1',
    purpose: dto.purpose,
    usageCount: 0,
    variables: [],
    ...overrides,
  };
}

function metadataRow(templateId: string): Row {
  return {
    data: { goals: [] },
    id: `metadata-${templateId}`,
    isDeleted: false,
    templateId,
    usageCount: 0,
  };
}

describe('TemplatesService persistence', () => {
  let state: State;
  let failures: { metadata?: Error };
  let usages: Row[];
  let service: TemplatesService;

  function seed(...rows: Row[]) {
    state.templates.push(...rows);
    state.metadata.push(...rows.map((row) => metadataRow(String(row.id))));
  }

  beforeEach(() => {
    state = { metadata: [], templates: [] };
    failures = {};
    usages = [];
    const prisma = createDatabase(state, failures) as unknown as PrismaService;
    const usage = {
      countByTemplate: async (templateId: string) =>
        usages.filter((row) => row.template === templateId).length,
      create: async (row: Row) => {
        usages.push(row);
        return row;
      },
    };
    const silent = () => undefined;
    service = new TemplatesService(
      prisma,
      usage as unknown as TemplateUsageService,
      new TemplateMetadataService(prisma),
      { debug: silent, error: silent } as unknown as LoggerService,
      {} as unknown as ModelsService,
      {} as unknown as ReplicateService,
    );
  });

  it('persists content, description and tags in config and returns their public fields', async () => {
    const result = await service.create(dto, 'org-1', 'user-1');

    expect(state.templates).toEqual([
      expect.objectContaining({
        config: {
          content: dto.content,
          description: dto.description,
          tags: dto.tags,
        },
        createdById: 'user-1',
        organizationId: 'org-1',
      }),
    ]);
    expect(result).toMatchObject({
      content: dto.content,
      description: dto.description,
      tags: dto.tags,
    });
  });

  it('rolls back the template row when creating its metadata fails', async () => {
    failures.metadata = new Error('metadata unavailable');

    await expect(service.create(dto, 'org-1', 'user-1')).rejects.toThrow();

    expect(state.templates).toEqual([]);
    expect(state.metadata).toEqual([]);
  });

  it('rolls back the template update when updating its metadata fails', async () => {
    seed(templateRow());
    failures.metadata = new Error('metadata unavailable');

    await expect(
      service.update(
        'template-1',
        { description: 'Changed', metadata: { goals: ['educate'] } },
        'org-1',
      ),
    ).rejects.toThrow();

    expect(state.templates[0].config).toMatchObject({
      description: dto.description,
    });
    expect(state.metadata[0].data).toEqual({ goals: [] });
  });

  it.each([
    ['another organization', templateRow({ organizationId: 'org-2' })],
    ['a deleted row', templateRow({ isDeleted: true })],
  ])(
    'creates an override when the prompt key only exists in %s',
    async (_name, existing) => {
      seed(existing);

      await expect(
        service.create(dto, 'org-1', 'user-1'),
      ).resolves.toMatchObject({ key: dto.key, organizationId: 'org-1' });
      expect(state.templates).toHaveLength(2);
    },
  );

  it('refuses a duplicate prompt key in the same organization', async () => {
    seed(templateRow());

    await expect(service.create(dto, 'org-1', 'user-1')).rejects.toThrow(
      'already exists',
    );
    expect(state.templates).toHaveLength(1);
  });

  it('preserves saved content and unrelated config when updating only the description', async () => {
    seed(
      templateRow({
        config: { ...(templateRow().config as Row), custom: true },
      }),
    );

    const result = await service.update(
      'template-1',
      { description: 'New description' },
      'org-1',
    );

    expect(state.templates[0].config).toEqual({
      content: dto.content,
      custom: true,
      description: 'New description',
      tags: dto.tags,
    });
    expect(result.content).toBe(dto.content);
    expect(result.description).toBe('New description');
  });

  it('updates metadata through its persistence service instead of treating the DTO as a relation input', async () => {
    seed(templateRow());

    await service.update(
      'template-1',
      { metadata: { goals: ['educate'] } },
      'org-1',
    );

    expect(state.metadata[0].data).toEqual({ goals: ['educate'] });
    expect(state.templates[0]).not.toHaveProperty('metadata');
  });

  it('keeps config values the typed columns never received', async () => {
    // Rows imported before the typed columns existed carry category and
    // isActive only inside `config`; the null columns must not shadow them.
    seed(
      templateRow({
        category: null,
        config: { category: 'caption', isActive: true },
        isActive: null,
      }),
    );

    expect((await service.findAll('org-1')).docs).toEqual([
      expect.objectContaining({ category: 'caption', isActive: true }),
    ]);
  });

  it('lets a stored column win over the config value', async () => {
    seed(
      templateRow({
        category: 'email',
        config: { category: 'caption', isActive: true },
        isActive: false,
      }),
    );

    expect((await service.findAll('org-1')).docs).toEqual([
      expect.objectContaining({ category: 'email', isActive: false }),
    ]);
  });

  it('hydrates config fields for list and detail reads', async () => {
    seed(templateRow());

    expect(await service.findOne('template-1', 'org-1')).toMatchObject({
      content: dto.content,
    });
    expect((await service.findAll('org-1')).docs).toEqual([
      expect.objectContaining({ content: dto.content }),
    ]);
  });

  it('searches the label and the description stored in config', async () => {
    seed(
      templateRow({ id: 'by-label', label: 'Greeting card' }),
      templateRow({
        config: { description: 'Warm GREETING for new users' },
        id: 'by-description',
        label: 'Welcome',
      }),
      templateRow({
        config: { description: 'Monthly digest' },
        id: 'unrelated',
        label: 'Newsletter',
      }),
    );

    const { docs } = await service.findAll('org-1', { search: 'greeting' });

    expect(docs.map((doc) => doc.id).sort()).toEqual([
      'by-description',
      'by-label',
    ]);
  });

  it('keeps searches scoped to the active organization and live templates', async () => {
    seed(
      templateRow({ id: 'own' }),
      templateRow({ id: 'other-org', organizationId: 'org-2' }),
      templateRow({ id: 'deleted', isDeleted: true }),
    );

    const { docs, totalDocs } = await service.findAll('org-1', {
      search: 'greeting',
    });

    expect(docs.map((doc) => doc.id)).toEqual(['own']);
    expect(totalDocs).toBe(1);
  });

  it('pages newest first in the database and reports totals', async () => {
    seed(
      ...Array.from({ length: 45 }, (_, index) =>
        templateRow({
          createdAt: new Date(index + 1),
          id: `template-${index + 1}`,
        }),
      ),
    );

    const result = await service.findAll('org-1', { limit: 20, page: 3 });

    expect(result.docs.map((doc) => doc.id)).toEqual([
      'template-5',
      'template-4',
      'template-3',
      'template-2',
      'template-1',
    ]);
    expect(result).toMatchObject({
      hasNextPage: false,
      hasPrevPage: true,
      page: 3,
      totalDocs: 45,
      totalPages: 3,
    });
  });

  it('ranks popular templates by usage, unused last, newest first on ties', async () => {
    seed(
      templateRow({ createdAt: new Date(1), id: 'older-3', usageCount: 3 }),
      templateRow({ createdAt: new Date(2), id: 'never', usageCount: null }),
      templateRow({ createdAt: new Date(3), id: 'top', usageCount: 7 }),
      templateRow({ createdAt: new Date(4), id: 'newer-3', usageCount: 3 }),
    );

    const { docs } = await service.findAll('org-1', { sort: 'popular' });

    expect(docs.map((doc) => doc.id)).toEqual([
      'top',
      'newer-3',
      'older-3',
      'never',
    ]);
  });

  it('limits missing-organization reads to global templates', async () => {
    seed(
      templateRow({ id: 'global', organizationId: null }),
      templateRow({ id: 'tenant' }),
    );

    expect((await service.findAll()).docs.map((doc) => doc.id)).toEqual([
      'global',
    ]);
    await expect(service.findOne('global')).resolves.toMatchObject({
      id: 'global',
    });
    await expect(service.findOne('tenant')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('soft-deletes only a live template of the caller organization', async () => {
    seed(templateRow());

    await expect(service.remove('template-1', 'org-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(state.templates[0].isDeleted).toBe(false);

    await service.remove('template-1', 'org-1');

    expect(state.templates[0].isDeleted).toBe(true);
    await expect(service.findOne('template-1', 'org-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('renders the organization override before the global prompt', async () => {
    seed(
      templateRow({
        config: { content: 'Global hi {{name}}' },
        id: 'global',
        organizationId: null,
      }),
      templateRow({ config: { content: 'Org hi {{name}}' }, id: 'override' }),
    );

    await expect(
      service.getRenderedPrompt('greeting', { name: 'Vincent' }, 'org-1'),
    ).resolves.toBe('Org hi Vincent');
    await expect(
      service.getRenderedPrompt('greeting', { name: 'Vincent' }, 'org-2'),
    ).resolves.toBe('Global hi Vincent');
  });

  it('fills persisted content and records use through the public template operation', async () => {
    seed(templateRow());

    const result = await service.useTemplate(
      { templateId: 'template-1', variables: { name: 'Vincent' } },
      'org-1',
      'user-1',
    );

    expect(result.generatedContent).toBe('Hello Vincent');
    expect(usages).toEqual([
      expect.objectContaining({
        generatedContent: 'Hello Vincent',
        organization: 'org-1',
        template: 'template-1',
        user: 'user-1',
      }),
    ]);
    expect(state.templates[0].usageCount).toBe(1);
    expect(state.metadata[0]).toMatchObject({
      lastUsed: expect.any(Date),
      usageCount: 1,
    });
  });

  it('reports a missing prompt before rendering', async () => {
    await expect(
      service.getRenderedPrompt('missing', {}, 'org-1'),
    ).rejects.toThrow('Template');
  });
});
