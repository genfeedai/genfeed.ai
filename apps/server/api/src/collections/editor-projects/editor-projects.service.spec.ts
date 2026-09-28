import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { ConflictException } from '@nestjs/common';

interface CapturedSql {
  sql?: string;
  text?: string;
  values?: unknown[];
}

const ORG_ID = 'org-1';
const PROJECT_ID = 'project-1';

function setup(readRow: () => Record<string, unknown> | null) {
  const steps: string[] = [];
  const tx = {
    $queryRaw: vi.fn(async (_query: CapturedSql) => {
      steps.push('lock');
      return [];
    }),
    editorProject: {
      findFirst: vi.fn(async () => {
        steps.push('read');
        return readRow();
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        steps.push('write');
        return { ...readRow(), ...data };
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      async (execute: (client: typeof tx) => Promise<unknown>) => {
        steps.push('begin');
        const result = await execute(tx);
        steps.push('commit');
        return result;
      },
    ),
    editorProject: tx.editorProject,
  };
  const service = new EditorProjectsService(
    prisma as unknown as PrismaService,
    {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    } as unknown as LoggerService,
  );
  return { prisma, service, steps, tx };
}

const row = (config: Record<string, unknown>) => ({
  config,
  id: PROJECT_ID,
  isDeleted: false,
  organizationId: ORG_ID,
  tracks: [],
});

describe('EditorProjectsService.updateEditorContent', () => {
  it('locks the row and re-reads it inside the transaction before writing', async () => {
    const { service, steps, tx } = setup(() => row({ name: 'Draft' }));

    await service.updateEditorContent(PROJECT_ID, ORG_ID, { name: 'Edited' });

    expect(steps).toEqual(['begin', 'lock', 'read', 'write', 'commit']);
    const [query] = tx.$queryRaw.mock.calls[0] as [CapturedSql];
    const sql = query.sql ?? query.text ?? '';
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('"editor_projects"');
    expect(query.values).toEqual(expect.arrayContaining([PROJECT_ID, ORG_ID]));
    expect(tx.editorProject.findFirst).toHaveBeenCalledWith({
      where: { id: PROJECT_ID, isDeleted: false, organizationId: ORG_ID },
    });
  });

  it('keeps a render status that landed after the request was read', async () => {
    // The controller read `draft`; a render completed before the lock.
    const { service, tx } = setup(() =>
      row({
        name: 'Draft',
        renderExport: { job: { jobId: 'job-1' } },
        settings: { fps: 30 },
        status: 'completed',
        totalDurationFrames: 300,
      }),
    );
    const tracks = [{ clips: [], id: 'track-1' }];

    await service.updateEditorContent(PROJECT_ID, ORG_ID, {
      name: 'Edited',
      settings: { fps: 24 },
      totalDurationFrames: 450,
      tracks: tracks as never,
    });

    expect(tx.editorProject.update).toHaveBeenCalledWith({
      data: {
        config: {
          name: 'Edited',
          renderExport: { job: { jobId: 'job-1' } },
          settings: { fps: 24 },
          status: 'completed',
          totalDurationFrames: 450,
        },
        tracks,
      },
      where: { id: PROJECT_ID, isDeleted: false, organizationId: ORG_ID },
    });
  });

  it('refuses a composition-backed project under the lock', async () => {
    const { service, tx } = setup(() =>
      row({ composition: { id: 'product-story' }, name: 'Story' }),
    );

    await expect(
      service.updateEditorContent(PROJECT_ID, ORG_ID, { name: 'Edited' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.editorProject.update).not.toHaveBeenCalled();
  });

  it('returns not found when the project is gone or outside the organization', async () => {
    const { service, tx } = setup(() => null);

    await expect(
      service.updateEditorContent(PROJECT_ID, ORG_ID, { name: 'Edited' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.editorProject.update).not.toHaveBeenCalled();
  });

  it('writes an update the generated Prisma client accepts', async () => {
    // Service specs mock Prisma, so a lenient fake would accept any shape.
    // Validate the exact payload against the real generated client: it
    // rejects unknown top-level fields (e.g. `name`) client-side, before any
    // connection is attempted.
    const { PrismaClient } =
      await vi.importActual<typeof import('@genfeedai/prisma')>(
        '@genfeedai/prisma',
      );
    const { PrismaPg } =
      await vi.importActual<typeof import('@prisma/adapter-pg')>(
        '@prisma/adapter-pg',
      );
    const { service, tx } = setup(() => row({ name: 'Draft' }));

    await service.updateEditorContent(PROJECT_ID, ORG_ID, {
      name: 'Edited',
      settings: { fps: 30 },
      thumbnailUrl: 'https://cdn.example.test/thumb.jpg',
      totalDurationFrames: 450,
      tracks: [],
    });

    const [args] = tx.editorProject.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    const prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: 'postgresql://127.0.0.1:1/validation-only',
      }),
    });
    const error = await prisma.editorProject
      .update({ data: args.data, where: { id: PROJECT_ID } })
      .catch((reason: unknown) => reason);
    await prisma.$disconnect();

    // Reaching the (unreachable) database proves validation passed.
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).not.toBe('PrismaClientValidationError');
  });
});
