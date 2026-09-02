import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { MusicGenerationService } from '@api/collections/musics/services/music-generation.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ActivitySource, ModelCategory } from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('musics')
@UseGuards(RolesGuard)
export class MusicsOperationsController {
  constructor(
    readonly loggerService: LoggerService,
    private readonly musicGenerationService: MusicGenerationService,
  ) {}

  @Post()
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @UseInterceptors(CreditsInterceptor)
  @Credits({
    description: 'Music generation',
    source: ActivitySource.MUSIC_GENERATION,
  })
  @ValidateModel({ category: ModelCategory.MUSIC })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createMusicDto: CreateMusicDto,
  ): Promise<JsonApiSingleResponse> {
    return this.musicGenerationService.generateMusic(
      user,
      createMusicDto,
      request,
    );
  }
}
