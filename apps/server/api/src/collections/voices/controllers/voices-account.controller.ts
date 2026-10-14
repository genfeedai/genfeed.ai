import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AccountVoicesQueryDto } from '@api/collections/voices/dto/account-voices-query.dto';
import { ImportAccountVoiceDto } from '@api/collections/voices/dto/import-account-voice.dto';
import { ElevenLabsAccountVoicesService } from '@api/collections/voices/services/elevenlabs-account-voices.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type {
  ElevenLabsAccountVoicePage,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { VoiceSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

/** The organization's personal ElevenLabs account voices. */
@AutoSwagger()
@Controller('voices')
export class VoicesAccountController {
  private readonly resourceName = 'VoicesController';

  constructor(
    private readonly accountVoicesService: ElevenLabsAccountVoicesService,
  ) {}

  @Get('elevenlabs/account')
  @ApiOperation({
    operationId: 'VoicesController.findAccountVoices',
    summary: 'findAccountVoices',
  })
  @RateLimit({ limit: 60, windowMs: 60 * 1000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAccountVoices(
    @CurrentUser() user: User,
    @Query() query: AccountVoicesQueryDto,
  ): Promise<{ data: ElevenLabsAccountVoicePage }> {
    return {
      data: await this.accountVoicesService.browse(user.organizationId, query),
    };
  }

  @Post('elevenlabs/account/import')
  @ApiOperation({
    operationId: 'VoicesController.importAccountVoice',
    summary: 'importAccountVoice',
  })
  @RateLimit({ limit: 30, windowMs: 60 * 1000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async importAccountVoice(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: ImportAccountVoiceDto,
  ): Promise<JsonApiSingleResponse> {
    const voice = await this.accountVoicesService.import(
      user,
      dto.externalVoiceId,
    );
    return serializeSingle(request, VoiceSerializer, voice);
  }

  @Delete('imported/:id')
  @ApiOperation({
    operationId: 'VoicesController.unlinkImportedVoice',
    summary: 'unlinkImportedVoice',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async unlinkImportedVoice(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      throw new BadRequestException('Invalid voice ID');
    }

    const voice = await this.accountVoicesService.unlink(
      user.organizationId,
      id,
    );
    if (!voice) {
      return returnNotFound(this.resourceName, id);
    }
    return serializeSingle(request, VoiceSerializer, voice);
  }
}
