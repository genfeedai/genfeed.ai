import { TemplateMetadataService } from '@api/collections/template-metadata/services/template-metadata.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it } from 'vitest';

type Row = Record<string, unknown> & { id: string; templateId: string };
type Client = Parameters<TemplateMetadataService['create']>[2];

/**
 * A `templateMetadata` table in memory: what `create` inserts, `findFirst`
 * reads back (by `templateId`) and `update` merges into.
 */
function metadataTable(rows: Row[] = []) {
  const table: Row[] = rows.map((row) => ({ ...row }));
  const templateMetadata = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `metadata-${table.length + 1}`, ...data } as Row;
      table.push(row);
      return row;
    },
    findFirst: async ({ where }: { where: { templateId: string } }) =>
      table.find(
        (row) => row.templateId === where.templateId && !row.isDeleted,
      ) ?? null,
    update: async ({
      data,
      where,
    }: {
      data: Record<string, unknown>;
      where: { id: string };
    }) => {
      const row = table.find((item) => item.id === where.id);
      if (!row) {
        throw new Error(`No metadata ${where.id}`);
      }
      Object.assign(row, data);
      return row;
    },
  };
  // Only the delegate methods the service calls are backed.
  const client = { templateMetadata } as unknown as NonNullable<Client>;
  return { client, table };
}

describe('TemplateMetadataService.update', () => {
  it('merges config-backed fields without dropping saved metadata', async () => {
    const { client, table } = metadataTable([
      {
        author: 'Original',
        data: { custom: true, difficulty: 'beginner', estimatedTime: 10 },
        id: 'metadata-1',
        isDeleted: false,
        templateId: 'template-1',
      },
    ]);
    const service = new TemplateMetadataService(
      client as unknown as PrismaService,
    );

    const result = await service.update('template-1', {
      author: 'New',
      goals: ['educate'],
    });

    expect(table).toEqual([
      {
        author: 'New',
        data: {
          custom: true,
          difficulty: 'beginner',
          estimatedTime: 10,
          goals: ['educate'],
        },
        id: 'metadata-1',
        isDeleted: false,
        templateId: 'template-1',
      },
    ]);
    expect(result).toMatchObject({
      author: 'New',
      estimatedTime: 10,
      goals: ['educate'],
    });
  });

  it('writes through the supplied transaction, never the root client', async () => {
    const root = metadataTable();
    const tx = metadataTable();
    const service = new TemplateMetadataService(
      root.client as unknown as PrismaService,
    );

    await service.create('template-1', { author: 'Author' }, tx.client);
    await service.update('template-1', { author: 'Editor' }, tx.client);

    expect(root.table).toEqual([]);
    expect(tx.table).toEqual([
      expect.objectContaining({
        author: 'Editor',
        id: 'metadata-1',
        templateId: 'template-1',
        usageCount: 0,
      }),
    ]);
  });
});
