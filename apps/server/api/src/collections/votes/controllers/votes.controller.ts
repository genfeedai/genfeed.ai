import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateVoteDto } from '@api/collections/votes/dto/create-vote.dto';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { VoteSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('votes')
export class VotesController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly votesService: VotesService,
  ) {}

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @Body() createVoteDto: CreateVoteDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    try {
      if (!createVoteDto.entity || !isEntityId(createVoteDto.entity)) {
        throw new BadRequestException('Invalid entity id');
      }

      const vote = await this.votesService.create({
        entityId: createVoteDto.entity,
        entityModel: createVoteDto.entityModel,
        userId: user.userId ?? user.id,
      } as unknown as CreateVoteDto);

      return serializeSingle(request, VoteSerializer, vote);
    } catch (error: unknown) {
      throw new BadRequestException((error as Error)?.message);
    }
  }

  @Delete()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Query('entity') entityId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    if (!isEntityId(entityId)) {
      throw new BadRequestException('Invalid entity id');
    }

    await this.votesService.patchAll(
      {
        entityId,
        userId: user.userId ?? user.id,
      },
      { isDeleted: true },
    );
  }
}
