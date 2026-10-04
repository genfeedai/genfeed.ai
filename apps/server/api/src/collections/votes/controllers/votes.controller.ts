import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateVoteDto } from '@api/collections/votes/dto/create-vote.dto';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { VoteEntityModel } from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { VoteSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpException,
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
    private readonly prisma: PrismaService,
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

      if (!user.organizationId) {
        throw new NotFoundException(
          createVoteDto.entityModel,
          createVoteDto.entity,
        );
      }

      // Fail closed: only an entity in the caller's own organization can be
      // voted on, so a foreign or unknown id never reaches the votes table.
      if (
        !(await this.isEntityInOrganization(
          createVoteDto.entityModel,
          createVoteDto.entity,
          user.organizationId,
        ))
      ) {
        throw new NotFoundException(
          createVoteDto.entityModel,
          createVoteDto.entity,
        );
      }

      const { vote } = await this.votesService.addVote({
        entityId: createVoteDto.entity,
        entityModel: createVoteDto.entityModel,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      });

      return serializeSingle(request, VoteSerializer, vote);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
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

    await this.votesService.removeVote({
      entityId,
      organizationId: user.organizationId || undefined,
      userId: user.userId ?? user.id,
    });
  }

  private async isEntityInOrganization(
    entityModel: VoteEntityModel,
    entityId: string,
    organizationId: string,
  ): Promise<boolean> {
    const where = { id: entityId, isDeleted: false, organizationId };

    const row =
      entityModel === VoteEntityModel.PROMPT
        ? await this.prisma.prompt.findFirst({ select: { id: true }, where })
        : await this.prisma.ingredient.findFirst({
            select: { id: true },
            where,
          });

    return Boolean(row);
  }
}
