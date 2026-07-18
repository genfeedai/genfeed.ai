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

  private mergeProjectStatus(
    project: { config?: unknown },
    status: EditorProjectStatus,
  ): Record<string, unknown> {
    return {
      ...this.readProjectConfig(project.config),
      status,
    };
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
        config: this.mergeProjectStatus(
          existing,
          EditorProjectStatus.RENDERING,
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

  /**
   * Mark project as completed with rendered video reference
   */
  async markAsCompleted(
    id: string,
    renderedVideoId: string,
  ): Promise<EditorProjectDocument> {
    const existing = await findUniqueOrThrow(
      this.prisma.editorProject,
      { where: { id } },
      'Project',
    );

    const project = await this.prisma.editorProject.update({
      data: {
        config: this.mergeProjectStatus(
          existing,
          EditorProjectStatus.COMPLETED,
        ) as never,
        renderedVideoId,
      },
      where: { id },
    });

    return project as unknown as EditorProjectDocument;
  }

  /**
   * Mark project as failed
   */
  async markAsFailed(id: string): Promise<EditorProjectDocument> {
    const existing = await findUniqueOrThrow(
      this.prisma.editorProject,
      { where: { id } },
      'Project',
    );

    const project = await this.prisma.editorProject.update({
      data: {
        config: this.mergeProjectStatus(
          existing,
          EditorProjectStatus.FAILED,
        ) as never,
      },
      where: { id },
    });

    return project as unknown as EditorProjectDocument;
  }
}
