import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { VoiceCloneService } from '@api/collections/voices/services/voice-clone.service';
import { VoiceLibraryService } from '@api/collections/voices/services/voice-library.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { VoiceCloneSerializer, VoiceSerializer } from '@genfeedai/serializers';
import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('voices')
export class VoicesController {
  private readonly resourceName = 'VoicesController';

  constructor(
    private readonly voiceCloneService: VoiceCloneService,
    private readonly voiceLibraryService: VoiceLibraryService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Query() query: VoicesQueryDto,
    @Req() request: Request,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const data = await this.voiceLibraryService.findAll(user, query);
    return serializeCollection(request, VoiceSerializer, data);
  }

  @Get('cloned')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findClonedVoices(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: VoicesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const data = await this.voiceLibraryService.findCloned(user, query);
    return serializeCollection(request, VoiceCloneSerializer, data);
  }

  @Delete('clone/:id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async deleteClonedVoice(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      throw new HttpException(
        { detail: 'Invalid voice ID', title: 'Validation failed' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const voice = await this.voiceCloneService.deleteClonedVoice(user, id);
    if (!voice) {
      return returnNotFound(this.resourceName, id);
    }

    return serializeSingle(request, VoiceCloneSerializer, voice);
  }
}
