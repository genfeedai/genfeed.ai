import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { CreateWarmupAccountDto } from '@api/endpoints/admin/warmup-accounts/dto/create-warmup-account.dto';
import { AdminWarmupAccountsService } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WarmupAccountSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Warm-up Accounts')
@Controller('admin/warmup-accounts')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class WarmupAccountsController {
  constructor(
    private readonly warmupAccountsService: AdminWarmupAccountsService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Provision a lead warm-up account' })
  async create(
    @Body() dto: CreateWarmupAccountDto,
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    try {
      const account = await this.warmupAccountsService.create(
        this.getActorUserId(user),
        dto,
      );
      return serializeSingle(request, WarmupAccountSerializer, account);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'createWarmup');
    }
  }

  @Get()
  @ApiOperation({ summary: 'List warm-up accounts' })
  async list(@Req() request: Request) {
    try {
      const accounts = await this.warmupAccountsService.list();
      return serializeCollection(request, WarmupAccountSerializer, {
        docs: accounts,
        hasNextPage: false,
        hasPrevPage: false,
        limit: accounts.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: accounts.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listWarmups');
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get warm-up account details' })
  async get(@Param('id') id: string, @Req() request: Request) {
    try {
      const account = await this.warmupAccountsService.get(id);
      return serializeSingle(request, WarmupAccountSerializer, account);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getWarmup');
    }
  }

  private getActorUserId(user: User): string {
    const actorUserId = getPublicMetadata(user).user?.toString().trim();

    if (!actorUserId) {
      throw new BadRequestException(
        'Local user id is required to provision warm-up accounts',
      );
    }

    return actorUserId;
  }
}
