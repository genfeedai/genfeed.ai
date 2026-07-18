import { CreateEditorProjectDto } from '@api/collections/editor-projects/dto/create-editor-project.dto';
import { UpdateEditorProjectDto } from '@api/collections/editor-projects/dto/update-editor-project.dto';
import type { EditorProjectDocument } from '@api/collections/editor-projects/schemas/editor-project.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  findOrThrow,
  findUniqueOrThrow,
} from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { EditorProjectStatus } from '@genfeedai/enums';
import type {
  IEditorRenderCorrelation,
  IEditorRenderOutputMetadata,
  IEditorRenderProvenance,
} from '@genfeedai/interfaces';
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

  private isProjectObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private readProjectConfig(value: unknown): Record<string, unknown> {
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

  async findForRender(
    id: string,
    organizationId: string,
  ): Promise<EditorProjectDocument> {
    const project = await findOrThrow(
      this.prisma.editorProject,
      { where: { id, isDeleted: false, organizationId } },
      'Project',
    );

    return this.normalizeDocument(project);
  }

  /**
   * Atomic CAS: only transitions DRAFT/COMPLETED/FAILED -> RENDERING.
   *
   * Uses `updateMany` with a status-not-RENDERING filter so that two
   * concurrent callers cannot both succeed — the second write will match
   * zero rows and be treated as a conflict.
   */
  async markAsRendering(
    id: string,
    organizationId: string,
    renderExport: IEditorRenderProvenance,
  ): Promise<EditorProjectDocument> {
    // Verify the project exists and belongs to this organisation first so we
    // can return a meaningful NotFoundException vs. a generic ConflictException.
    const existing = await findOrThrow(
      this.prisma.editorProject,
      { where: { id, isDeleted: false, organizationId } },
      'Project',
    );

    // Atomic conditional update: only succeeds when the embedded status field
    // is NOT already RENDERING.  If two requests race, exactly one will update
    // count === 1; the other will get count === 0 → ConflictException.
    const updated = await this.prisma.editorProject.updateMany({
      data: {
        config: this.mergeProjectConfig(
          existing,
          EditorProjectStatus.RENDERING,
          renderExport,
        ) as never,
        updatedAt: new Date(),
      },
      where: {
        id,
        isDeleted: false,
        organizationId,
        // The JSON path filter below prevents the update when the embedded
        // config.status is already RENDERING.  Prisma exposes JSON-path
        // filtering via `path`+`equals` on JsonFilter.
        NOT: {
          config: {
            path: ['status'],
            equals: EditorProjectStatus.RENDERING,
          },
        },
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Project is already rendering');
    }

    const project = await this.prisma.editorProject.findUniqueOrThrow({
      where: { id },
    });

    return project as unknown as EditorProjectDocument;
  }

  async attachRenderJob(
    id: string,
    job: IEditorRenderCorrelation,
  ): Promise<EditorProjectDocument> {
    const existing = await findUniqueOrThrow(
      this.prisma.editorProject,
      { where: { id } },
      'Project',
    );
    const renderExport = this.readRenderProvenance(existing);

    if (!renderExport) {
      throw new ConflictException('Project render provenance is missing');
    }

    const project = await this.prisma.editorProject.update({
      data: {
        config: this.mergeProjectConfig(
          existing,
          EditorProjectStatus.RENDERING,
          { ...renderExport, job },
        ) as never,
      },
      where: { id },
    });

    return project as unknown as EditorProjectDocument;
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
   * Mark project as completed with rendered video reference
   */
  async markAsCompleted(
    id: string,
    renderedVideoId: string,
    output: IEditorRenderOutputMetadata,
    expectedJobId?: string,
  ): Promise<EditorProjectDocument> {
    const existing = await findUniqueOrThrow(
      this.prisma.editorProject,
      { where: { id } },
      'Project',
    );

    const renderExport = this.readRenderProvenance(existing);
    if (expectedJobId && renderExport?.job?.jobId !== expectedJobId) {
      throw new ConflictException('Render job no longer owns this project');
    }

    const completedConfig = this.mergeProjectConfig(
      existing,
      EditorProjectStatus.COMPLETED,
      {
        ...(renderExport ?? ({} as IEditorRenderProvenance)),
        completedAt: new Date().toISOString(),
        output,
      },
    ) as never;
    const updated = await this.prisma.editorProject.updateMany({
      data: {
        config: completedConfig,
        renderedVideoId,
      },
      where: {
        id,
        AND: {
          config: {
            path: ['status'],
            equals: EditorProjectStatus.RENDERING,
          },
        },
        ...(expectedJobId
          ? {
              config: {
                path: ['renderExport', 'job', 'jobId'],
                equals: expectedJobId,
              },
            }
          : {}),
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Render job no longer owns this project');
    }

    return (await this.prisma.editorProject.findUniqueOrThrow({
      where: { id },
    })) as unknown as EditorProjectDocument;
  }

  /**
   * Mark project as failed
   */
  async markAsFailed(
    id: string,
    expectedJobId?: string,
  ): Promise<EditorProjectDocument> {
    const existing = await findUniqueOrThrow(
      this.prisma.editorProject,
      { where: { id } },
      'Project',
    );

    const renderExport = this.readRenderProvenance(existing);
    if (expectedJobId && renderExport?.job?.jobId !== expectedJobId) {
      throw new ConflictException('Render job no longer owns this project');
    }

    const failedConfig = this.mergeProjectConfig(
      existing,
      EditorProjectStatus.FAILED,
    ) as never;
    const updated = await this.prisma.editorProject.updateMany({
      data: {
        config: failedConfig,
      },
      where: {
        id,
        AND: {
          config: {
            path: ['status'],
            equals: EditorProjectStatus.RENDERING,
          },
        },
        ...(expectedJobId
          ? {
              config: {
                path: ['renderExport', 'job', 'jobId'],
                equals: expectedJobId,
              },
            }
          : {}),
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Render job no longer owns this project');
    }

    return (await this.prisma.editorProject.findUniqueOrThrow({
      where: { id },
    })) as unknown as EditorProjectDocument;
  }
}
