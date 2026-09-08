import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { RenderRemotionCompositionDto } from '@api/collections/editor-projects/dto/render-remotion-composition.dto';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { buildProductStoryComposition } from '@api/collections/editor-projects/utils/remotion-composition.util';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { REMOTION_COMPOSITION_INPUT_SCHEMA } from '@genfeedai/actions';
import {
  EditorProjectStatus,
  IngredientCategory,
  MemberRole,
} from '@genfeedai/contracts';
import {
  EDITOR_RENDERER_VERSION,
  type IRemotionCompositionInput,
  type IRemotionCompositionJob,
} from '@genfeedai/contracts/interfaces';
import { toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  type OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const hash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class RemotionCompositionsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: EditorProjectsService,
    private readonly renderer: EditorRenderService,
    private readonly workflows: SystemWorkflowRunnerService,
    private readonly files: FileQueueService,
  ) {}

  onModuleInit(): void {
    this.workflows.registerAction('remotion.composition.catalog', () => ({
      compositions: this.catalog(),
    }));
    for (const operation of ['render', 'status', 'cancel', 'retry'] as const) {
      this.workflows.registerAction(
        `remotion.composition.${operation}`,
        async ({ context, input, provenance }) => {
          const user: AuthenticatedUser = {
            id: context.userId,
            userId: context.userId,
            organizationId: context.organizationId,
            brandId: '',
          };
          if (operation === 'render') {
            return this.render(user, {
              ...input,
              requestId: provenance.idempotencyKey
                ? hash(provenance.idempotencyKey)
                : input.requestId,
            });
          }
          if (typeof input.projectId !== 'string' || !input.projectId)
            throw new BadRequestException('projectId is required.');
          return this[operation](user, input.projectId);
        },
      );
    }
  }

  catalog() {
    return [
      {
        id: 'product-story',
        label: 'Branded product story',
        version: '1',
        rendererVersion: EDITOR_RENDERER_VERSION,
        inputSchema: REMOTION_COMPOSITION_INPUT_SCHEMA,
        outputSettings: {
          formats: ['portrait', 'landscape', 'square'],
          fps: 30,
          sceneDurationSeconds: 4,
          maxDurationSeconds: 20,
        },
      },
    ];
  }

  async validateInput(raw: unknown): Promise<IRemotionCompositionInput> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new BadRequestException('Expected structured composition inputs.');
    const dto = plainToInstance(RenderRemotionCompositionDto, raw);
    const errors = await validate(dto, {
      forbidNonWhitelisted: true,
      whitelist: true,
    });
    if (errors.length)
      throw new UnprocessableEntityException({
        code: 'composition_input_invalid',
        message: 'Correct the listed fields using the composition catalog.',
        violations: errors.map((error) => ({
          field: error.property,
          reasons: Object.values(error.constraints ?? {}),
        })),
      });
    if (dto.rendererVersion !== EDITOR_RENDERER_VERSION)
      throw new UnprocessableEntityException({
        code: 'composition_version_incompatible',
        field: 'rendererVersion',
        message: `Use ${EDITOR_RENDERER_VERSION} from the composition catalog.`,
      });
    const input: IRemotionCompositionInput = {
      accentColor: dto.accentColor.toLowerCase(),
      benefits: dto.benefits.map((value) => value.trim()),
      brandId: dto.brandId.trim(),
      brandName: dto.brandName.trim(),
      callToAction: dto.callToAction.trim(),
      compositionId: dto.compositionId,
      format: dto.format,
      rendererVersion: dto.rendererVersion,
      requestId: dto.requestId.trim(),
      title: dto.title.trim(),
      version: dto.version,
      ...(dto.sourceVideoId ? { sourceVideoId: dto.sourceVideoId.trim() } : {}),
    };
    if (
      [
        input.brandId,
        input.brandName,
        input.callToAction,
        input.requestId,
        input.title,
        ...input.benefits,
      ].some((value) => !value)
    )
      throw new UnprocessableEntityException(
        'Composition text and identifiers cannot be blank.',
      );
    return input;
  }

  private async authorize(
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<void> {
    const [brand, member] = await Promise.all([
      this.prisma.brand.findFirst({
        where: {
          id: brandId,
          organizationId: user.organizationId,
          isDeleted: false,
        },
        select: { id: true },
      }),
      this.prisma.member.findFirst({
        where: {
          userId: user.userId,
          organizationId: user.organizationId,
          isDeleted: false,
          isActive: true,
        },
        include: { role: true, brands: { select: { id: true } } },
      }),
    ]);
    if (!brand || !member)
      throw new ForbiddenException(
        'An active membership and accessible brand are required.',
      );
    const admin =
      member.role.key === MemberRole.OWNER ||
      member.role.key === MemberRole.ADMIN;
    if (
      !admin &&
      member.brands.length &&
      !member.brands.some((assigned) => assigned.id === brandId)
    )
      throw new ForbiddenException(
        'This brand is not assigned to your membership.',
      );
    if (user.brandId && user.brandId !== brandId)
      throw new ForbiddenException(
        'Switch to this brand before rendering its composition.',
      );
  }

  private async validateSources(
    user: AuthenticatedUser,
    input: IRemotionCompositionInput,
  ): Promise<void> {
    if (!input.sourceVideoId) return;
    const source = await this.prisma.ingredient.findFirst({
      where: {
        id: input.sourceVideoId,
        organizationId: user.organizationId,
        brandId: input.brandId,
        isDeleted: false,
        category: IngredientCategory.VIDEO,
      },
      include: { metadata: true },
    });
    if (!source)
      throw new NotFoundException('Source video is unavailable in this brand.');
    const requiredSeconds = (input.benefits.length + 2) * 4;
    if (
      !source.metadata?.duration ||
      source.metadata.duration < requiredSeconds
    )
      throw new UnprocessableEntityException({
        field: 'sourceVideoId',
        message: `Choose a video with at least ${requiredSeconds} seconds of footage, or omit it for a text-only composition.`,
      });
  }

  async render(
    user: AuthenticatedUser,
    raw: unknown,
  ): Promise<IRemotionCompositionJob> {
    const input = await this.validateInput(raw);
    await this.authorize(user, input.brandId);
    await this.validateSources(user, input);
    const id = `c${hash([user.organizationId, user.userId, input.brandId, input.requestId]).slice(0, 24)}`;
    const inputHash = hash(input);
    const composition = buildProductStoryComposition(input);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`;
      const existing = await tx.editorProject.findFirst({
        where: { id, organizationId: user.organizationId, isDeleted: false },
      });
      if (existing) {
        const config = this.projects.readProjectConfig(existing.config);
        const provenance = this.projects.readProjectConfig(config.composition);
        if (provenance.inputHash !== inputHash)
          throw new ConflictException(
            'This requestId was used with different inputs. Use a new requestId to make another video.',
          );
        return;
      }
      await tx.editorProject.create({
        data: {
          id,
          organizationId: user.organizationId,
          brandId: input.brandId,
          userId: user.userId,
          tracks: toPrismaJson(composition.tracks),
          config: toPrismaJson({
            ...composition,
            tracks: undefined,
            name: input.title,
            status: EditorProjectStatus.DRAFT,
            composition: {
              id: input.compositionId,
              version: input.version,
              rendererVersion: input.rendererVersion,
              requestId: input.requestId,
              inputHash,
              inputs: input,
              sourceAssetIds: input.sourceVideoId ? [input.sourceVideoId] : [],
            },
          }),
        },
      });
    });
    const project = await this.authorizedProject(user, id);
    if (this.projects.readStatus(project) === EditorProjectStatus.DRAFT)
      await this.submit(user, id, [EditorProjectStatus.DRAFT]);
    return this.status(user, id);
  }

  private async authorizedProject(user: AuthenticatedUser, id: string) {
    const project = await this.projects.findForRender(id, user.organizationId);
    if (!project.brandId || !project.config?.composition)
      throw new NotFoundException('Composition render not found.');
    await this.authorize(user, project.brandId);
    return project;
  }

  private async submit(
    user: AuthenticatedUser,
    id: string,
    allowedStatuses: EditorProjectStatus[],
  ): Promise<void> {
    try {
      await this.renderer.render(
        id,
        user.organizationId,
        user,
        allowedStatuses,
      );
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
    }
  }

  async status(
    user: AuthenticatedUser,
    id: string,
  ): Promise<IRemotionCompositionJob> {
    const project = await this.authorizedProject(user, id);
    const provenance = this.projects.readProjectConfig(
      project.config?.composition,
    );
    const render = this.projects.readRenderProvenance(project);
    const projectStatus =
      this.projects.readStatus(project) ?? EditorProjectStatus.DRAFT;
    let status: string =
      projectStatus === EditorProjectStatus.DRAFT ? 'available' : projectStatus;
    let progress: number | undefined;
    if (projectStatus === EditorProjectStatus.RENDERING) {
      status = 'queued';
      if (render?.job) {
        try {
          const job = await this.files.getJobStatus(render.job.jobId);
          if (job.state === 'active' || job.state === 'completed')
            status = 'rendering';
          if (typeof job.progress === 'number' && Number.isFinite(job.progress))
            progress = Math.max(0, Math.min(100, job.progress));
        } catch {
          status = 'rendering';
        }
      }
    }
    return {
      id,
      compositionId: String(provenance.id),
      version: String(provenance.version),
      rendererVersion: String(provenance.rendererVersion),
      status,
      sourceAssetIds: Array.isArray(provenance.sourceAssetIds)
        ? provenance.sourceAssetIds.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
      ...(progress !== undefined ? { progress } : {}),
      ...(render?.job ? { jobId: render.job.jobId } : {}),
      ...(projectStatus === EditorProjectStatus.COMPLETED &&
      project.renderedVideoId
        ? { assetId: project.renderedVideoId, assetUrl: render?.output?.url }
        : {}),
      ...(projectStatus === EditorProjectStatus.FAILED
        ? {
            failure:
              'Rendering failed. Retry this render or submit corrected inputs with a new requestId.',
          }
        : {}),
    };
  }

  async cancel(
    user: AuthenticatedUser,
    id: string,
  ): Promise<IRemotionCompositionJob> {
    const project = await this.authorizedProject(user, id);
    const status = this.projects.readStatus(project);
    if (status === EditorProjectStatus.RENDERING)
      await this.renderer.cancel(id, user.organizationId);
    return this.status(user, id);
  }

  async retry(
    user: AuthenticatedUser,
    id: string,
  ): Promise<IRemotionCompositionJob> {
    const project = await this.authorizedProject(user, id);
    if (
      [EditorProjectStatus.FAILED, EditorProjectStatus.CANCELLED].includes(
        this.projects.readStatus(project) as EditorProjectStatus,
      )
    ) {
      const provenance = this.projects.readProjectConfig(
        project.config?.composition,
      );
      const input = await this.validateInput(provenance.inputs);
      await this.validateSources(user, input);
      await this.submit(user, id, [
        EditorProjectStatus.FAILED,
        EditorProjectStatus.CANCELLED,
      ]);
    }
    return this.status(user, id);
  }
}
