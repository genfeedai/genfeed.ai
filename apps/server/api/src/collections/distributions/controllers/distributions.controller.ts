import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateDistributionDto } from '@api/collections/distributions/dto/create-distribution.dto';
import { QueryDistributionDto } from '@api/collections/distributions/dto/query-distribution.dto';
import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { DistributionSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Distributions')
@Controller('distributions')
export class DistributionsController {
  constructor(private readonly distributionsService: DistributionsService) {}

  /**
   * Create a distribution. Dispatches to the platform-specific send/schedule
   * logic based on `platform`; `scheduledAt` present -> schedule, absent -> immediate send.
   *
   * POST /distributions
   */
  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(@Body() dto: CreateDistributionDto, @CurrentUser() user: User) {
    const { organization, user: userId } = getPublicMetadata(user);

    return await this.distributionsService.createFromRequest(
      organization,
      userId,
      dto,
    );
  }

  /**
   * List distributions with optional platform filter
   *
   * GET /distributions?platform=telegram&status=published
   */
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async list(
    @Req() req: Request,
    @Query() query: QueryDistributionDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const page = query.page ? Number.parseInt(query.page, 10) : 1;
    const limit = query.limit ? Number.parseInt(query.limit, 10) : 20;

    const data = await this.distributionsService.findByOrganization(
      organization,
      {
        platform: query.platform,
        status: query.status,
      },
      page,
      limit,
    );

    return serializeCollection(req, DistributionSerializer, data);
  }

  /**
   * Get a single distribution
   *
   * GET /distributions/:id
   */
  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);

    const data = await this.distributionsService.findOneByOrganization(
      id,
      organization,
    );

    return serializeSingle(req, DistributionSerializer, data);
  }

  /**
   * Cancel a scheduled distribution
   *
   * DELETE /distributions/:id
   */
  @Delete(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);

    const data = await this.distributionsService.cancelScheduled(
      id,
      organization,
    );

    return serializeSingle(req, DistributionSerializer, data);
  }
}
