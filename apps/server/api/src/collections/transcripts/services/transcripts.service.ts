import { CreateTranscriptDto } from '@api/collections/transcripts/dto/create-transcript.dto';
import { UpdateTranscriptDto } from '@api/collections/transcripts/dto/update-transcript.dto';
import {
  Transcript,
  type TranscriptDocument,
} from '@api/collections/transcripts/schemas/transcript.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { TranscriptStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';

@Injectable()
export class TranscriptsService extends BaseService<
  TranscriptDocument,
  CreateTranscriptDto,
  UpdateTranscriptDto
> {
  private readonly constructorName = this.constructor.name;

  constructor(
    @InjectModel(Transcript.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<TranscriptDocument>,
    public readonly logger: LoggerService,
    @Optional() private readonly fileQueueService?: FileQueueService,
  ) {
    super(model, logger);
  }

  /**
   * Get context-aware population options
   */
  protected getPopulationForContext(
    context: 'list' | 'detail' | 'minimal' | 'create' = 'minimal',
  ): PopulateOption[] {
    switch (context) {
      case 'list':
        return [
          PopulatePatterns.userMinimal,
          { path: 'article', select: '_id label slug status' },
        ];
      case 'detail':
        return [
          PopulatePatterns.userMinimal,
          PopulatePatterns.organizationMinimal,
          { path: 'article', select: '_id label slug content status category' },
        ];
      case 'create':
        return [PopulatePatterns.userMinimal];
      default:
        return [PopulatePatterns.userId];
    }
  }

  /**
   * Extract YouTube video ID from URL
   */
  private extractYoutubeId(url: string): string {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    throw new Error('Invalid YouTube URL');
  }

  @HandleErrors('create transcript', 'transcripts')
  async createTranscript(
    createTranscriptDto: CreateTranscriptDto,
    userId: string,
    organizationId: string,
  ): Promise<TranscriptDocument> {
    this.logger.debug(`${this.constructorName} createTranscript`, {
      createTranscriptDto,
    });

    // Extract YouTube ID
    const youtubeId = this.extractYoutubeId(createTranscriptDto.youtubeUrl);

    // Create transcript document
    const transcript = await this.model.create({
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      status: TranscriptStatus.PENDING,
      transcriptText: '',
      user: new Types.ObjectId(userId),
      youtubeId,
      youtubeUrl: createTranscriptDto.youtubeUrl,
    });

    // Queue YouTube download job
    if (this.fileQueueService) {
      await this.fileQueueService.processFile({
        ingredientId: transcript._id.toString(),
        organizationId,
        params: {
          transcriptId: transcript._id.toString(),
          youtubeId,
          youtubeUrl: createTranscriptDto.youtubeUrl,
        },
        type: 'youtube-download-audio',
        userId,
      });
    }

    return transcript;
  }

  @HandleErrors('find transcripts', 'transcripts')
  async findTranscripts(
    _userId: string,
    organizationId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    docs: TranscriptDocument[];
    totalDocs: number;
    limit: number;
    page: number;
    totalPages: number;
  }> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ];

    const result = await this.model.aggregatePaginate(
      this.model.aggregate(pipeline),
      {
        limit,
        page,
      },
    );

    return result as unknown as {
      docs: TranscriptDocument[];
      totalDocs: number;
      limit: number;
      page: number;
      totalPages: number;
    };
  }

  @HandleErrors('update transcript status', 'transcripts')
  async updateStatus(
    transcriptId: string,
    status: TranscriptStatus,
    error?: string,
  ): Promise<TranscriptDocument> {
    const updateData: UpdateTranscriptDto = { status };

    if (error) {
      updateData.error = error;
    }

    const transcript = await this.model
      .findByIdAndUpdate(transcriptId, updateData, { returnDocument: 'after' })
      .exec();

    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    return transcript;
  }

  @HandleErrors('update transcript text', 'transcripts')
  async updateTranscriptText(
    transcriptId: string,
    transcriptText: string,
    language?: string,
  ): Promise<TranscriptDocument> {
    const updateData: UpdateTranscriptDto = {
      status: TranscriptStatus.GENERATING_ARTICLE,
      transcriptText,
    };

    if (language) {
      updateData.language = language;
    }

    const transcript = await this.model
      .findByIdAndUpdate(transcriptId, updateData, { returnDocument: 'after' })
      .exec();

    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    return transcript;
  }

  @HandleErrors('link article to transcript', 'transcripts')
  async linkArticle(
    transcriptId: string,
    articleId: string,
  ): Promise<TranscriptDocument> {
    const transcript = await this.model
      .findByIdAndUpdate(
        transcriptId,
        {
          article: new Types.ObjectId(articleId),
          status: TranscriptStatus.GENERATED,
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    return transcript;
  }

  @HandleErrors('update transcript', 'transcripts')
  async updateOne(
    filter: unknown,
    updateData: UpdateTranscriptDto,
  ): Promise<TranscriptDocument> {
    const transcript = await this.model
      .findOneAndUpdate(filter, updateData, { returnDocument: 'after' })
      .exec();

    if (!transcript) {
      throw new Error('Transcript not found');
    }

    return transcript;
  }
}
