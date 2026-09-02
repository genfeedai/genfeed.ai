import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CompleteSocialWarmupItemDto } from '@api/collections/social-warmup-enrollments/dto/complete-social-warmup-item.dto';
import { CreateSocialWarmupEnrollmentDto } from '@api/collections/social-warmup-enrollments/dto/create-social-warmup-enrollment.dto';
import { SocialWarmupEnrollmentsQueryDto } from '@api/collections/social-warmup-enrollments/dto/social-warmup-enrollments-query.dto';
import { UpsertSocialWarmupSignalDto } from '@api/collections/social-warmup-enrollments/dto/upsert-social-warmup-signal.dto';
import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BrandScopeQueryDto } from '@api/helpers/dto/brand-scope-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { resolveRequiredBrandRequestContext } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { SocialWarmupEnrollmentSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Social Warmup Enrollments')
@Controller('social-warmup-enrollments')
@UseGuards(RolesGuard)
export class SocialWarmupEnrollmentsController {
  constructor(
    private readonly socialWarmupEnrollmentsService: SocialWarmupEnrollmentsService,
  ) {}

  @Get()
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SocialWarmupEnrollmentsQueryDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const result = await this.socialWarmupEnrollmentsService.findAllScoped(
      context,
      query,
    );
    return serializeCollection(
      request,
      SocialWarmupEnrollmentSerializer,
      result,
    );
  }

  @Post()
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreateSocialWarmupEnrollmentDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user);
    const enrollment = await this.socialWarmupEnrollmentsService.enrollScoped(
      body,
      context,
    );
    return serializeSingle(
      request,
      SocialWarmupEnrollmentSerializer,
      enrollment,
    );
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const enrollment = await this.socialWarmupEnrollmentsService.findOneScoped(
      id,
      context,
    );
    return serializeSingle(
      request,
      SocialWarmupEnrollmentSerializer,
      enrollment,
    );
  }

  @Post(':id/items/:itemId/complete')
  async completeItem(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: CompleteSocialWarmupItemDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const enrollment =
      await this.socialWarmupEnrollmentsService.completeItemScoped(
        id,
        itemId,
        body,
        context,
      );
    return serializeSingle(
      request,
      SocialWarmupEnrollmentSerializer,
      enrollment,
    );
  }

  @Post(':id/items/:itemId/reopen')
  async reopenItem(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: CompleteSocialWarmupItemDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const enrollment =
      await this.socialWarmupEnrollmentsService.reopenItemScoped(
        id,
        itemId,
        body,
        context,
      );
    return serializeSingle(
      request,
      SocialWarmupEnrollmentSerializer,
      enrollment,
    );
  }

  @Post(':id/signals')
  async upsertSignal(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
    @Body() body: UpsertSocialWarmupSignalDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const enrollment =
      await this.socialWarmupEnrollmentsService.upsertSignalScoped(
        id,
        body,
        context,
      );
    return serializeSingle(
      request,
      SocialWarmupEnrollmentSerializer,
      enrollment,
    );
  }
}
