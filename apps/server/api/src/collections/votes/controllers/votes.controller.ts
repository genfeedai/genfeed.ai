import { CreateVoteDto } from '@api/collections/votes/dto/create-vote.dto';
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
        !/^[0-9a-f]{24}$/i.test(createVoteDto.entity)
      ) {
        throw new BadRequestException('Invalid entity id');
      }

      const vote = await this.votesService.create({
        entityId: createVoteDto.entity,
        entityModel: createVoteDto.entityModel,
        userId: publicMetadata.user,
      } as unknown as CreateVoteDto);

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
    if (!/^[0-9a-f]{24}$/i.test(entityId)) {
      throw new BadRequestException('Invalid entity id');
    }

    const publicMetadata = getPublicMetadata(user);

    await this.votesService.patchAll(
      {
        entity: entityId,
        isDeleted: false,
        user: publicMetadata.user,
      },
      { isDeleted: true },
    );
  }
}
