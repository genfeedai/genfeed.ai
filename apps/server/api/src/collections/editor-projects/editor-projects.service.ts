import { CreateEditorProjectDto } from '@api/collections/editor-projects/dto/create-editor-project.dto';
import { UpdateEditorProjectDto } from '@api/collections/editor-projects/dto/update-editor-project.dto';
import {
  EditorProject,
  type EditorProjectDocument,
} from '@api/collections/editor-projects/schemas/editor-project.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { EditorProjectStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class EditorProjectsService extends BaseService<
  EditorProjectDocument,
  CreateEditorProjectDto,
  UpdateEditorProjectDto
> {
  constructor(
    @InjectModel(EditorProject.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<EditorProjectDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  /**
   * Atomic CAS: only transitions DRAFT/COMPLETED/FAILED -> RENDERING
   */
  async markAsRendering(
    id: string,
    organizationId: string,
  ): Promise<EditorProjectDocument> {
    const project = await this.model.findOneAndUpdate(
      {
        // @ts-expect-error TS2769
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        status: { $ne: EditorProjectStatus.RENDERING },
      },
      { status: EditorProjectStatus.RENDERING },
      { returnDocument: 'after' },
    );

    if (!project) {
      const exists = await this.findOne({
        _id: id,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      });
      if (exists) {
        throw new ConflictException('Project is already rendering');
      }
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  /**
   * Mark project as completed with rendered video reference
   */
  async markAsCompleted(
    id: string,
    renderedVideoId: string,
  ): Promise<EditorProjectDocument> {
    const project = await this.model.findByIdAndUpdate(
      id,
      {
        renderedVideo: new Types.ObjectId(renderedVideoId),
        status: EditorProjectStatus.COMPLETED,
      },
      { returnDocument: 'after' },
    );

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  /**
   * Mark project as failed
   */
  async markAsFailed(id: string): Promise<EditorProjectDocument> {
    const project = await this.model.findByIdAndUpdate(
      id,
      { status: EditorProjectStatus.FAILED },
      { returnDocument: 'after' },
    );

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }
}
