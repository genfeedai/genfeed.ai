import { CreateEditorProjectDto } from '@api/collections/editor-projects/dto/create-editor-project.dto';
import { UpdateEditorProjectDto } from '@api/collections/editor-projects/dto/update-editor-project.dto';
import type { EditorProjectDocument } from '@api/collections/editor-projects/schemas/editor-project.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  findOrThrow,
  findUniqueOrThrow,
} from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { EditorProjectStatus } from '@genfeedai/contracts';
import type {
  IEditorRenderCorrelation,
  IEditorRenderFailure,
  IEditorRenderOutputMetadata,
  IEditorRenderProvenance,
  IUpdateEditorProjectDto,
} from '@genfeedai/contracts/interfaces';
import { type EditorProject, Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class EditorProjectsService extends BaseService<
  EditorProjectDocument,
  CreateEditorProjectDto,
  UpdateEditorProjectDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'editorProject', logger);
  }

  protected override normalizeDocument(
    document: unknown,
  ): EditorProjectDocument {
    const record = super.normalizeDocument(document);
    return { ...this.readProjectConfig(record.config), ...record };
  }

  private isProjectObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  readProjectConfig(value: unknown): Record<string, unknown> {
    return this.isProjectObject(value) ? value : {};
  }

  private mergeProjectConfig(
    project: { config?: unknown },
    status: EditorProjectStatus,
    renderExport?: IEditorRenderProvenance,
  ): Record<string, unknown> {
    return {
      ...this.readProjectConfig(project.config),
      ...(renderExport ? { renderExport } : {}),
      status,
    };
  }

  readRenderProvenance(project: {
    config?: unknown;
  }): IEditorRenderProvenance | undefined {
    const renderExport = this.readProjectConfig(project.config).renderExport;
    return this.isProjectObject(renderExport)
      ? (renderExport as unknown as IEditorRenderProvenance)
      : undefined;
  }

  readStatus(project: { config?: unknown }): EditorProjectStatus | undefined {
    const status = this.readProjectConfig(project.config).status;
    return Object.values(EditorProjectStatus).includes(
      status as EditorProjectStatus,
    )
      ? (status as EditorProjectStatus)
      : undefined;
  }

  /**
   * Apply Editor edits. `tracks` is a column; the Editor's other fields live
   * under `config`, which the render lifecycle also writes (status,
   * renderExport). Lock the row and re-read it inside the transaction so a
   * render status change that lands mid-request is merged, not overwritten.
   */
  async updateEditorContent(
    id: string,
    organizationId: string,
    changes: IUpdateEditorProjectDto,
  ): Promise<EditorProjectDocument> {
    const { name, settings, thumbnailUrl, totalDurationFrames, tracks } =
      changes;

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "editor_projects" WHERE "id" = ${id} AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`,
      );
      const current = await tx.editorProject.findFirst({
        where: scopedWhere(organizationId, { id }),
      });

      if (!current) {
        throw new NotFoundException('Editor project', id);
      }

      const config = this.readProjectConfig(current.config);
      if (config.composition) {
        throw new ConflictException(
          'Approved compositions are immutable. Submit updated inputs with a new requestId.',
        );
      }

      const updated = await tx.editorProject.update({
        data: {
          config: toPrismaJson({
            ...config,
            ...(name !== undefined ? { name } : {}),
            ...(settings !== undefined
              ? {
                  // A partial update merges; null leaves a setting unchanged.
                  settings: {
                    ...this.readProjectConfig(config.settings),
                    ...Object.fromEntries(
                      Object.entries(settings ?? {}).filter(
                        ([, value]) => value !== null && value !== undefined,
                      ),
                    ),
                  },
                }
              : {}),
            ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
            ...(totalDurationFrames !== undefined
              ? { totalDurationFrames }
              : {}),
          }),
          ...(tracks !== undefined ? { tracks: toPrismaJson(tracks) } : {}),
        },
        where: scopedWhere(organizationId, { id }),
      });

      return this.normalizeDocument(updated);
    });
  }

  async findForRender(
    id: string,
    organizationId: string,
  ): Promise<EditorProjectDocument> {
    const project = await findOrThrow(
      this.prisma.editorProject,
      { where: scopedWhere(organizationId, { id }) },
      'Project',
    );

    return this.normalizeDocument(project);
  }

  /**
   * Run a render-state write under the same row lock as Editor saves: lock the
   * row, re-read it, and merge only render fields (status, renderExport,
   * renderedVideoId) into the fresh config. Neither writer can put back a
   * stale config over the other's change.
   */
  private async withLockedProject(
    id: string,
    organizationId: string | undefined,
    write: (
      tx: Prisma.TransactionClient,
      project: EditorProject,
    ) => Promise<EditorProjectDocument>,
  ): Promise<EditorProjectDocument> {
    return this.prisma.$transaction(async (tx) => {
      if (organizationId) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "editor_projects" WHERE "id" = ${id} AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`,
        );
        const project = await findOrThrow(
          tx.editorProject,
          { where: scopedWhere(organizationId, { id }) },
          'Project',
        );
        return write(tx, project);
      }

      // Render workers (no tenant context) address the project by id only;
      // the org comes from the locked row. HTTP callers always pass one.
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "editor_projects" WHERE "id" = ${id} FOR UPDATE`,
      );
      const project = await findUniqueOrThrow(
        tx.editorProject,
        { where: { id } },
        'Project',
      );
      return write(tx, project);
    });
  }

  /**
   * Transition DRAFT/COMPLETED/FAILED -> RENDERING. Concurrent callers
   * serialize on the row lock, so the second one sees RENDERING and gets a
   * conflict.
   */
  async markAsRendering(
    id: string,
    organizationId: string,
    renderExport: IEditorRenderProvenance,
    allowedStatuses?: EditorProjectStatus[],
  ): Promise<EditorProjectDocument> {
    return this.withLockedProject(id, organizationId, async (tx, existing) => {
      const status = this.readStatus(existing);
      if (
        status === EditorProjectStatus.RENDERING ||
        (allowedStatuses &&
          !allowedStatuses.includes(status as EditorProjectStatus))
      ) {
        throw new ConflictException('Project is already rendering');
      }

      const project = await tx.editorProject.update({
        data: {
          config: toPrismaJson(
            this.mergeProjectConfig(
              existing,
              EditorProjectStatus.RENDERING,
              renderExport,
            ),
          ),
          updatedAt: new Date(),
        },
        where: scopedWhere(organizationId, { id }),
      });

      return project as unknown as EditorProjectDocument;
    });
  }

  /**
   * `organizationId` is the request tenant for HTTP callers. Render workers
   * address the project by id alone and omit it.
   */
  async attachRenderJob(
    id: string,
    job: IEditorRenderCorrelation,
    organizationId?: string,
  ): Promise<EditorProjectDocument> {
    return this.withLockedProject(id, organizationId, async (tx, existing) => {
      const renderExport = this.readRenderProvenance(existing);

      if (!renderExport) {
        throw new ConflictException('Project render provenance is missing');
      }

      const project = await tx.editorProject.update({
        data: {
          config: toPrismaJson(
            this.mergeProjectConfig(existing, EditorProjectStatus.RENDERING, {
              ...renderExport,
              job,
            }),
          ),
        },
        where: scopedWhere(existing.organizationId, { id }),
      });

      return project as unknown as EditorProjectDocument;
    });
  }

  async findRenderingProjects(): Promise<EditorProjectDocument[]> {
    const projects = await this.prisma.editorProject.findMany({
      where: {
        isDeleted: false,
        config: {
          path: ['status'],
          equals: EditorProjectStatus.RENDERING,
        },
      },
    });

    return projects as unknown as EditorProjectDocument[];
  }

  /**
   * Only the render that still owns the project (status RENDERING and, when
   * given, the same job id) may finish it.
   */
  private assertRenderOwnership(
    existing: EditorProject,
    expectedJobId?: string,
  ): IEditorRenderProvenance | undefined {
    const renderExport = this.readRenderProvenance(existing);
    if (
      existing.isDeleted ||
      this.readStatus(existing) !== EditorProjectStatus.RENDERING ||
      (expectedJobId && renderExport?.job?.jobId !== expectedJobId)
    ) {
      throw new ConflictException('Render job no longer owns this project');
    }
    return renderExport;
  }

  /**
   * Mark project as completed with rendered video reference
   */
  async markAsCompleted(
    id: string,
    renderedVideoId: string,
    output: IEditorRenderOutputMetadata,
    expectedJobId?: string,
  ): Promise<EditorProjectDocument> {
    return this.withLockedProject(id, undefined, async (tx, existing) => {
      const renderExport = this.assertRenderOwnership(existing, expectedJobId);

      const project = await tx.editorProject.update({
        data: {
          config: toPrismaJson(
            this.mergeProjectConfig(existing, EditorProjectStatus.COMPLETED, {
              ...(renderExport ?? ({} as IEditorRenderProvenance)),
              completedAt: new Date().toISOString(),
              output,
            }),
          ),
          renderedVideoId,
        },
        where: scopedWhere(existing.organizationId, { id }),
      });

      return project as unknown as EditorProjectDocument;
    });
  }

  /**
   * Mark project as failed
   */
  async markAsFailed(
    id: string,
    expectedJobId?: string,
    failure?: IEditorRenderFailure,
    organizationId?: string,
  ): Promise<EditorProjectDocument> {
    return this.markAsTerminal(
      id,
      EditorProjectStatus.FAILED,
      expectedJobId,
      failure,
      organizationId,
    );
  }

  async markAsCancelled(
    id: string,
    expectedJobId: string,
    failure: IEditorRenderFailure,
    organizationId?: string,
  ): Promise<EditorProjectDocument> {
    return this.markAsTerminal(
      id,
      EditorProjectStatus.CANCELLED,
      expectedJobId,
      failure,
      organizationId,
    );
  }

  private async markAsTerminal(
    id: string,
    status: EditorProjectStatus.CANCELLED | EditorProjectStatus.FAILED,
    expectedJobId?: string,
    failure?: IEditorRenderFailure,
    organizationId?: string,
  ): Promise<EditorProjectDocument> {
    return this.withLockedProject(id, organizationId, async (tx, existing) => {
      const renderExport = this.assertRenderOwnership(existing, expectedJobId);

      const project = await tx.editorProject.update({
        data: {
          config: toPrismaJson(
            this.mergeProjectConfig(
              existing,
              status,
              failure
                ? {
                    ...(renderExport ?? ({} as IEditorRenderProvenance)),
                    failure,
                  }
                : undefined,
            ),
          ),
        },
        where: scopedWhere(existing.organizationId, { id }),
      });

      return project as unknown as EditorProjectDocument;
    });
  }
}
