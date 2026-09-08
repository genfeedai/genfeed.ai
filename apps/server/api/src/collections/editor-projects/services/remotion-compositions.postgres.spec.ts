import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import type { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { RemotionCompositionsService } from '@api/collections/editor-projects/services/remotion-compositions.service';
import { buildValidatedEditorExportContract } from '@api/collections/editor-projects/utils/editor-export-contract.util';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { EditorProjectStatus, MemberRole } from '@genfeedai/contracts';
import { EDITOR_RENDERER_VERSION } from '@genfeedai/contracts/interfaces';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
const describePostgres = process.env.REMOTION_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const user: AuthenticatedUser = {
  id: 'user-1',
  userId: 'user-1',
  organizationId: 'org-1',
  brandId: 'brand-1',
};
const input = {
  accentColor: '#123456',
  benefits: ['One benefit'],
  brandId: 'brand-1',
  brandName: 'Genfeed',
  callToAction: 'Try it',
  compositionId: 'product-story',
  format: 'portrait',
  rendererVersion: EDITOR_RENDERER_VERSION,
  requestId: 'request-1',
  title: 'Product story',
  version: '1',
};

describePostgres('Remotion durable submission with PostgreSQL', () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let schema: string;
  let projects: EditorProjectsService;
  let service: RemotionCompositionsService;
  let submitted: string[];

  beforeEach(async () => {
    schema = `remotion_${randomUUID().replaceAll('-', '')}`;
    pool = new Pool({
      connectionString: process.env.REMOTION_TEST_DATABASE_URL,
    });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`CREATE TABLE "${schema}".editor_projects (
      id text PRIMARY KEY, "organizationId" text NOT NULL, "brandId" text, "userId" text NOT NULL, "renderedVideoId" text,
      tracks jsonb NOT NULL DEFAULT '[]', config jsonb NOT NULL DEFAULT '{}', "isDeleted" boolean NOT NULL DEFAULT false,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: process.env.REMOTION_TEST_DATABASE_URL,
          options: `-c search_path="${schema}",public`,
        },
        { schema },
      ),
    });
    projects = new EditorProjectsService(
      prisma as unknown as PrismaService,
      {
        log: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as unknown as LoggerService,
    );
    const scopedPrisma = {
      $transaction: prisma.$transaction.bind(prisma),
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
      member: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ role: { key: MemberRole.OWNER }, brands: [] }),
      },
    };
    submitted = [];
    const renderer = {
      render: async (
        id: string,
        orgId: string,
        _user: AuthenticatedUser,
        allowedStatuses: EditorProjectStatus[],
      ) => {
        const project = await projects.findForRender(id, orgId);
        await projects.markAsRendering(
          id,
          orgId,
          {
            ...buildValidatedEditorExportContract(project),
            rendererVersion: EDITOR_RENDERER_VERSION,
          },
          allowedStatuses,
        );
        const jobId = randomUUID();
        submitted.push(jobId);
        await projects.attachRenderJob(id, {
          projectId: id,
          jobId,
          ingredientId: `asset-${jobId}`,
          metadataId: 'metadata-1',
          userId: user.id,
          room: 'user-1',
        });
      },
    };
    service = new RemotionCompositionsService(
      scopedPrisma as unknown as PrismaService,
      projects,
      renderer as unknown as EditorRenderService,
      { registerAction: vi.fn() } as unknown as SystemWorkflowRunnerService,
      {
        getJobStatus: vi.fn().mockResolvedValue({ state: 'pending' }),
      } as unknown as FileQueueService,
    );
  });

  afterEach(async () => {
    await prisma?.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });

  it('serializes concurrent submissions and retries without replacing a completed output', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.render(user, input)),
    );
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(await prisma.editorProject.count()).toBe(1);
    expect(submitted).toHaveLength(1);
    const id = results[0].id;
    const firstJob = submitted[0];
    await projects.markAsFailed(id, firstJob);
    await Promise.all(Array.from({ length: 5 }, () => service.retry(user, id)));
    expect(submitted).toHaveLength(2);
    const finalJob = submitted[1];
    await projects.markAsCompleted(
      id,
      'final-asset',
      {
        durationFrames: 360,
        durationSeconds: 12,
        fps: 30,
        height: 1920,
        width: 1080,
        rendererVersion: EDITOR_RENDERER_VERSION,
        s3Key: 'videos/final-asset.mp4',
        size: 100,
        url: 'https://assets.example/final-asset.mp4',
      },
      finalJob,
    );
    const completed = await Promise.all([
      service.render(user, input),
      service.retry(user, id),
    ]);
    expect(
      completed.every(
        (result) =>
          result.assetId === 'final-asset' && result.status === 'completed',
      ),
    ).toBe(true);
    expect(submitted).toHaveLength(2);
    await expect(
      service.render(user, { ...input, title: 'different' }),
    ).rejects.toThrow('different inputs');
  });
});
