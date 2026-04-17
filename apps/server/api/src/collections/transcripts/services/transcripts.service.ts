import { CreateTranscriptDto } from '@api/collections/transcripts/dto/create-transcript.dto';
import { UpdateTranscriptDto } from '@api/collections/transcripts/dto/update-transcript.dto';
import type { TranscriptDocument } from '@api/collections/transcripts/schemas/transcript.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { TranscriptStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class TranscriptsService extends BaseService<
  TranscriptDocument,
  CreateTranscriptDto,
  UpdateTranscriptDto
> {
  private readonly constructorName = this.constructor.name;

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    @Optional() private readonly fileQueueService?: FileQueueService,
  ) {
    super(prisma, 'transcript', logger);
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

    const youtubeId = this.extractYoutubeId(createTranscriptDto.youtubeUrl);

    const transcript = (await this.delegate.create({
      data: {
        isDeleted: false,
        organizationId,
        status: TranscriptStatus.PENDING,
        transcriptText: '',
        userId,
        youtubeId,
        youtubeUrl: createTranscriptDto.youtubeUrl,
      },
    })) as unknown as TranscriptDocument;

    if (this.fileQueueService) {
      await this.fileQueueService.processFile({
        ingredientId:
          transcript.id ??
          (transcript as Record<string, unknown>)._id?.toString(),
        organizationId,
        params: {
          transcriptId:
            transcript.id ??
            (transcript as Record<string, unknown>)._id?.toString(),
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
    const skip = (page - 1) * limit;

    const [docs, totalDocs] = await Promise.all([
      this.delegate.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        where: {
          isDeleted: false,
          organizationId,
        },
      }),
      this.delegate.count({
        where: {
          isDeleted: false,
          organizationId,
        },
      }),
    ]);

    return {
      docs: docs as unknown as TranscriptDocument[],
      limit,
      page,
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
    };
  }

  @HandleErrors('update transcript status', 'transcripts')
  async updateStatus(
    transcriptId: string,
    status: TranscriptStatus,
    error?: string,
  ): Promise<TranscriptDocument> {
    const updateData: Record<string, unknown> = { status };
    if (error) {
      updateData.error = error;
    }

    const transcript = await this.delegate.update({
      data: updateData,
      where: { id: transcriptId },
    });

    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    return transcript as unknown as TranscriptDocument;
  }

  @HandleErrors('update transcript text', 'transcripts')
  async updateTranscriptText(
    transcriptId: string,
    transcriptText: string,
    language?: string,
  ): Promise<TranscriptDocument> {
    const updateData: Record<string, unknown> = {
      status: TranscriptStatus.GENERATING_ARTICLE,
      transcriptText,
    };

    if (language) {
      updateData.language = language;
    }

    const transcript = await this.delegate.update({
      data: updateData,
      where: { id: transcriptId },
    });

    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    return transcript as unknown as TranscriptDocument;
  }

  @HandleErrors('link article to transcript', 'transcripts')
  async linkArticle(
    transcriptId: string,
    articleId: string,
  ): Promise<TranscriptDocument> {
    const transcript = await this.delegate.update({
      data: {
        articleId,
        status: TranscriptStatus.GENERATED,
      },
      where: { id: transcriptId },
    });

    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    return transcript as unknown as TranscriptDocument;
  }

  @HandleErrors('update transcript', 'transcripts')
  async updateOne(
    filter: Record<string, unknown>,
    updateData: UpdateTranscriptDto,
  ): Promise<TranscriptDocument> {
    const transcript = await this.delegate.update({
      data: updateData as Record<string, unknown>,
      where: filter,
    });

    if (!transcript) {
      throw new Error('Transcript not found');
    }

    return transcript as unknown as TranscriptDocument;
  }
}
