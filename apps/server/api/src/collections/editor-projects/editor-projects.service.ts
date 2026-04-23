import { CreateEditorProjectDto } from '@api/collections/editor-projects/dto/create-editor-project.dto';
import { UpdateEditorProjectDto } from '@api/collections/editor-projects/dto/update-editor-project.dto';
import type { EditorProjectDocument } from '@api/collections/editor-projects/schemas/editor-project.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { EditorProjectStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

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

  private readProjectStatus(project: {
    config?: unknown;
  }): EditorProjectStatus | undefined {
    const status = this.readProjectConfig(project.config).status;
    return typeof status === 'string'
      ? (status as EditorProjectStatus)
      : undefined;
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

  /**
   * Atomic CAS: only transitions DRAFT/COMPLETED/FAILED -> RENDERING
   */
  async markAsRendering(
    id: string,
    organizationId: string,
  ): Promise<EditorProjectDocument> {
    // Check current status first
    const existing = await this.prisma.editorProject.findFirst({
      where: { id, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    if (this.readProjectStatus(existing) === EditorProjectStatus.RENDERING) {
      throw new ConflictException('Project is already rendering');
    }

    const project = await this.prisma.editorProject.update({
      data: {
        config: this.mergeProjectStatus(
          existing,
          EditorProjectStatus.RENDERING,
        ) as never,
      },
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
    const existing = await this.prisma.editorProject.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

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
    const existing = await this.prisma.editorProject.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

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
