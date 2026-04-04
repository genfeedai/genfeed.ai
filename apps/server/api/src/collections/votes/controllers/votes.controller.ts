import { CreateVoteDto } from '@api/collections/votes/dto/create-vote.dto';
import { VoteEntity } from '@api/collections/votes/entities/vote.entity';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { VoteSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Types } from 'mongoose';

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
      const publicMetadata = getPublicMetadata(user);

      if (
        !createVoteDto.entity ||
        !Types.ObjectId.isValid(createVoteDto.entity)
      ) {
        throw new BadRequestException('Invalid entity id');
      }

      const vote = await this.votesService.create(
        new VoteEntity({
          ...createVoteDto,
          entity: new Types.ObjectId(createVoteDto.entity),
          user: new Types.ObjectId(publicMetadata.user),
        }),
      );

      return serializeSingle(request, VoteSerializer, vote);
    } catch (error: unknown) {
      throw new BadRequestException((error as Error)?.message);
    }
  }

  @Delete(':entityId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Param('entityId') entityId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(entityId)) {
      throw new BadRequestException('Invalid entity id');
    }

    const publicMetadata = getPublicMetadata(user);

    await this.votesService.patchAll(
      {
        entity: new Types.ObjectId(entityId),
        isDeleted: false,
        user: new Types.ObjectId(publicMetadata.user),
      },
      { $set: { isDeleted: true } },
    );
  }
}
