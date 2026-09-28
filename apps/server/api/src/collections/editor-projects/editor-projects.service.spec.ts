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

  it('never drops render-job ownership recorded after the request started', async () => {
    // Codex P1: the controller read a draft, then a render claimed the
    // project. The save must not erase `rendering` or the job correlation,
    // or render completion fails its ownership check.
    const renderExport = {
      job: { jobId: 'job-7' },
      requestedAt: '2026-09-28T00:00:00.000Z',
    };
    const { service, tx } = setup(() =>
      row({ name: 'Draft', renderExport, status: 'rendering' }),
    );

    await service.updateEditorContent(PROJECT_ID, ORG_ID, { name: 'Edited' });

    const [args] = tx.editorProject.update.mock.calls[0] as [
      { data: { config: Record<string, unknown> } },
    ];
    expect(args.data.config).toMatchObject({
      name: 'Edited',
      renderExport,
      status: 'rendering',
    });
  });

  it('merges a partial settings update into the saved settings', async () => {
    const saved = {
      backgroundColor: '#123456',
      format: 'portrait',
      fps: 30,
      height: 1920,
      width: 1080,
    };
    const { service, tx } = setup(() => row({ settings: saved }));

    await service.updateEditorContent(PROJECT_ID, ORG_ID, {
      settings: { fps: 60 },
    });

    const [args] = tx.editorProject.update.mock.calls[0] as [
      { data: { config: Record<string, unknown> } },
    ];
    expect(args.data.config.settings).toEqual({ ...saved, fps: 60 });
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

describe('EditorProjectsService render-state writers', () => {
  const renderingRow = (name: string) => ({
    config: {
      name,
      renderExport: { job: { jobId: 'job-1' }, requestedAt: 'then' },
      settings: { fps: 30 },
      status: 'rendering',
    },
    id: PROJECT_ID,
    isDeleted: false,
    organizationId: ORG_ID,
    renderedVideoId: null,
    tracks: [],
  });

  // An Editor rename commits right after the writer's first statement.
  // Without a row lock that statement is the writer's read, so it writes a
  // stale config back; with the lock the re-read sees the rename.
  function setupWithConcurrentRename(initial: Record<string, unknown>) {
    let statements = 0;
    const renamed = {
      ...initial,
      config: {
        ...(initial.config as Record<string, unknown>),
        name: 'Edited',
      },
    };
    const current = () => (statements > 1 ? renamed : initial);
    const writes: Array<Record<string, unknown>> = [];
    const delegate = {
      findFirst: vi.fn(async () => {
        statements += 1;
        return current();
      }),
      findUnique: vi.fn(async () => {
        statements += 1;
        return current();
      }),
      findUniqueOrThrow: vi.fn(async () => {
        statements += 1;
        return current();
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        statements += 1;
        writes.push(data);
        return { ...current(), ...data };
      }),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        statements += 1;
        writes.push(data);
        return { count: 1 };
      }),
    };
    const tx = {
      $queryRaw: vi.fn(async () => {
        statements += 1;
        return [];
      }),
      editorProject: delegate,
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn(
        async (execute: (client: typeof tx) => Promise<unknown>) => execute(tx),
      ),
    };
    const service = new EditorProjectsService(
      prisma as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
      } as unknown as LoggerService,
    );
    return { delegate, service, tx, writes };
  }

  const writtenConfig = (writes: Array<Record<string, unknown>>) =>
    writes.at(-1)?.config as Record<string, unknown>;

  it.each([
    [
      'markAsCompleted',
      (service: EditorProjectsService) =>
        service.markAsCompleted(
          PROJECT_ID,
          'video-9',
          { url: 'https://cdn.example.test/out.mp4' } as never,
          'job-1',
        ),
      'completed',
    ],
    [
      'markAsFailed',
      (service: EditorProjectsService) =>
        service.markAsFailed(PROJECT_ID, 'job-1', {
          reason: 'boom',
        } as never),
      'failed',
    ],
    [
      'attachRenderJob',
      (service: EditorProjectsService) =>
        service.attachRenderJob(PROJECT_ID, { jobId: 'job-2' } as never),
      'rendering',
    ],
  ])(
    '%s keeps an Editor rename that lands before its write',
    async (_name, write, status) => {
      const { service, tx, writes } = setupWithConcurrentRename(
        renderingRow('Draft'),
      );

      await write(service);

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(writtenConfig(writes)).toMatchObject({ name: 'Edited', status });
    },
  );

  it('markAsRendering keeps an Editor rename that lands before its write', async () => {
    const draft = {
      ...renderingRow('Draft'),
      config: { name: 'Draft', status: 'draft' },
    };
    const { service, writes } = setupWithConcurrentRename(draft);

    await service.markAsRendering(PROJECT_ID, ORG_ID, {
      requestedAt: 'now',
    } as never);

    expect(writtenConfig(writes)).toMatchObject({
      name: 'Edited',
      renderExport: { requestedAt: 'now' },
      status: 'rendering',
    });
  });

  it('refuses a completion from a job that no longer owns the project', async () => {
    const { service, writes } = setupWithConcurrentRename(
      renderingRow('Draft'),
    );

    await expect(
      service.markAsCompleted(
        PROJECT_ID,
        'video-9',
        { url: 'https://cdn.example.test/out.mp4' } as never,
        'job-other',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(writes).toEqual([]);
  });

  it('refuses to start a render while one is running', async () => {
    const { service, writes } = setupWithConcurrentRename(
      renderingRow('Draft'),
    );

    await expect(
      service.markAsRendering(PROJECT_ID, ORG_ID, {
        requestedAt: 'now',
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(writes).toEqual([]);
  });
});
