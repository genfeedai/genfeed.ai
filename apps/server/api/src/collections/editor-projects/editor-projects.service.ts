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

    if (existing.status === EditorProjectStatus.RENDERING) {
      throw new ConflictException('Project is already rendering');
    }

    const project = await this.prisma.editorProject.update({
      where: { id },
      data: { status: EditorProjectStatus.RENDERING },
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
      where: { id },
      data: {
        renderedVideoId,
        status: EditorProjectStatus.COMPLETED,
      },
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
      where: { id },
      data: { status: EditorProjectStatus.FAILED },
    });

    return project as unknown as EditorProjectDocument;
  }
}
