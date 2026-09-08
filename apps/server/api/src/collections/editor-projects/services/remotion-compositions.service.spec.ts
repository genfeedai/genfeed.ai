import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import type { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { RemotionCompositionsService } from '@api/collections/editor-projects/services/remotion-compositions.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { EDITOR_RENDERER_VERSION } from '@genfeedai/contracts/interfaces';
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';

const input = {
  accentColor: '#123456',
  benefits: ['First benefit'],
  brandId: 'brand-1',
  brandName: 'Genfeed',
  callToAction: 'Try it',
  compositionId: 'product-story',
  format: 'portrait',
  rendererVersion: EDITOR_RENDERER_VERSION,
  requestId: 'request-1',
  title: 'New product',
  version: '1',
};
const user: AuthenticatedUser = {
  id: 'user-1',
  userId: 'user-1',
  organizationId: 'org-1',
  brandId: 'brand-1',
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function setup() {
  let stored: Record<string, unknown> | undefined;
  const prisma = {
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
    member: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ brands: [], role: { key: MemberRole.OWNER } }),
    },
    ingredient: {
      findFirst: vi.fn().mockResolvedValue({ metadata: { duration: 30 } }),
    },
    editorProject: {
      findFirst: vi.fn(async () => stored),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        stored = data;
        return data;
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(
    (execute: (tx: typeof prisma) => Promise<unknown>) => execute(prisma),
  );
  const projects = {
    findForRender: vi.fn(async (_id: string, org: string) => {
      if (!stored || stored.organizationId !== org)
        throw new Error('Not found');
      return stored;
    }),
    readProjectConfig: record,
    readStatus: (project: Record<string, unknown>) =>
      record(project.config).status,
    readRenderProvenance: (project: Record<string, unknown>) =>
      record(project.config).renderExport,
  };
  const renderer = {
    render: vi.fn(async () => {
      const config = record(stored?.config);
      config.status = 'rendering';
      config.renderExport = { job: { jobId: 'job-1' } };
    }),
    cancel: vi.fn(async () => {
      record(stored?.config).status = 'cancelled';
    }),
  };
  const workflows = { registerAction: vi.fn() };
  const files = {
    getJobStatus: vi.fn().mockResolvedValue({ state: 'waiting', progress: 0 }),
  };
  const service = new RemotionCompositionsService(
    prisma as unknown as PrismaService,
    projects as unknown as EditorProjectsService,
    renderer as unknown as EditorRenderService,
    workflows as unknown as SystemWorkflowRunnerService,
    files as unknown as FileQueueService,
  );
  return {
    service,
    prisma,
    renderer,
    workflows,
    files,
    project: () => stored,
    config: () => record(stored?.config),
  };
}

describe('Remotion composition lifecycle', () => {
  it('lists a pinned composition with a closed input contract', () => {
    const { service } = setup();
    expect(service.catalog()[0]).toMatchObject({
      id: 'product-story',
      version: '1',
      rendererVersion: EDITOR_RENDERER_VERSION,
      inputSchema: { additionalProperties: false },
    });
  });

  it.each([
    { ...input, rendererVersion: 'remotion@old' },
    { ...input, version: '2' },
    { ...input, benefits: [] },
    { ...input, title: ' ' },
    { ...input, code: 'execute arbitrary code' },
    { ...input, sourceVideoUrl: 'https://attacker.example' },
  ])(
    'rejects invalid or executable inputs before any database or render access',
    async (invalid) => {
      const { service, prisma, renderer } = setup();
      await expect(service.render(user, invalid)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.brand.findFirst).not.toHaveBeenCalled();
      expect(renderer.render).not.toHaveBeenCalled();
    },
  );

  it('reuses the queued render for a repeated request and rejects changed content', async () => {
    const { service, prisma, renderer } = setup();
    const first = await service.render(user, input);
    expect(first).toMatchObject({ status: 'queued', jobId: 'job-1' });
    expect(await service.render(user, input)).toEqual(first);
    expect(prisma.editorProject.create).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    await expect(
      service.render(user, { ...input, title: 'Changed' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces active membership, assigned brand and current request brand', async () => {
    const { service, prisma, renderer } = setup();
    prisma.member.findFirst.mockResolvedValueOnce(null);
    await expect(service.render(user, input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    prisma.member.findFirst.mockResolvedValueOnce({
      brands: [{ id: 'different' }],
      role: { key: MemberRole.USER },
    });
    await expect(service.render(user, input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.render({ ...user, brandId: 'different' }, input),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('scopes source footage to the brand and refuses footage shorter than the composition', async () => {
    const { service, prisma } = setup();
    prisma.ingredient.findFirst.mockResolvedValue({
      metadata: { duration: 2 },
    });
    await expect(
      service.render(user, { ...input, sourceVideoId: 'source-1' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'source-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
          isDeleted: false,
        }),
      }),
    );
  });

  it('cancels, retries only terminal failures and never rerenders a completed asset', async () => {
    const { service, renderer, config, project } = setup();
    const first = await service.render(user, input);
    expect((await service.cancel(user, first.id)).status).toBe('cancelled');
    await service.retry(user, first.id);
    expect(renderer.render).toHaveBeenLastCalledWith(first.id, 'org-1', user, [
      'failed',
      'cancelled',
    ]);
    config().status = 'completed';
    config().renderExport = {
      job: { jobId: 'job-1' },
      output: { url: 'https://assets.example/video.mp4' },
    };
    const saved = project();
    if (saved) saved.renderedVideoId = 'asset-1';
    expect(await service.retry(user, first.id)).toMatchObject({
      status: 'completed',
      assetId: 'asset-1',
    });
    await service.cancel(user, first.id);
    await service.render(user, input);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.cancel).toHaveBeenCalledTimes(1);
  });

  it('reports active progress without exposing internal failure details', async () => {
    const { service, files, config } = setup();
    const job = await service.render(user, input);
    files.getJobStatus.mockResolvedValue({ state: 'active', progress: 42 });
    expect(await service.status(user, job.id)).toMatchObject({
      status: 'rendering',
      progress: 42,
    });
    config().status = 'failed';
    config().renderExport = { failure: { reason: '/private/secret/path' } };
    expect(JSON.stringify(await service.status(user, job.id))).not.toContain(
      '/private',
    );
  });

  it('registers catalog and lifecycle workflow actions through the shared service', () => {
    const { service, workflows } = setup();
    service.onModuleInit();
    expect(workflows.registerAction.mock.calls.map(([id]) => id)).toEqual([
      'remotion.composition.catalog',
      'remotion.composition.render',
      'remotion.composition.status',
      'remotion.composition.cancel',
      'remotion.composition.retry',
    ]);
  });
});
