import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { CreateTranscriptDto } from '@api/collections/transcripts/dto/create-transcript.dto';
import { UpdateTranscriptDto } from '@api/collections/transcripts/dto/update-transcript.dto';
import { TranscriptsService } from '@api/collections/transcripts/services/transcripts.service';
import { LogMethod } from '@server/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { TranscriptSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('transcripts')
export class TranscriptsController {
  constructor(private readonly transcriptsService: TranscriptsService) {}

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() req: Request,
    @Body() createTranscriptDto: CreateTranscriptDto,
    @CurrentUser() user: User,
  ) {
    const userId = user.userId ?? user.id;
    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organization ID is required');
    }

    const transcript = await this.transcriptsService.createTranscript(
      createTranscriptDto,
      userId,
      organizationId,
    );

    return serializeSingle(req, TranscriptSerializer, transcript);
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const userId = user.userId ?? user.id;
    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organization ID is required');
    }

    const result = await this.transcriptsService.findTranscripts(
      userId,
      organizationId,
      +page,
      +limit,
    );

    return serializeCollection(req, TranscriptSerializer, result);
  }

  @Get(':transcriptId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() req: Request,
    @Param('transcriptId') transcriptId: string,
    @CurrentUser() user: User,
  ) {
    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organization ID is required');
    }

    const transcript = await this.transcriptsService.findOne({
      id: transcriptId,
      organizationId: organizationId,
    });

    return serializeSingle(req, TranscriptSerializer, transcript);
  }

  @Patch(':transcriptId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() req: Request,
    @Param('transcriptId') transcriptId: string,
    @Body() updateTranscriptDto: UpdateTranscriptDto,
    @CurrentUser() user: User,
  ) {
    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organization ID is required');
    }

    const transcript = await this.transcriptsService.updateOne(
      { id: transcriptId, isDeleted: false, organizationId },
      updateTranscriptDto,
    );

    return serializeSingle(req, TranscriptSerializer, transcript);
  }
}
