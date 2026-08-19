import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreatePostingSignatureDto } from '@api/collections/posting-sets/dto/create-posting-signature.dto';
import { PostingSignaturesQueryDto } from '@api/collections/posting-sets/dto/posting-signatures-query.dto';
import { UpdatePostingSignatureDto } from '@api/collections/posting-sets/dto/update-posting-signature.dto';
import { PostingSignaturesService } from '@api/collections/posting-sets/services/posting-signatures.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  extractRequestContext,
  type RequestContext,
} from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { PostingSignatureSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('PostingSignatures')
@Controller('posting-signatures')
export class PostingSignaturesController {
  constructor(
    private readonly postingSignaturesService: PostingSignaturesService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PostingSignaturesQueryDto,
  ) {
    const context = this.requireScope(user, query);
    const result = await this.postingSignaturesService.findAllScoped(
      context,
      query,
    );
    return serializeCollection(request, PostingSignatureSerializer, result);
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreatePostingSignatureDto,
  ) {
    const context = this.requireScope(user);
    const signature = await this.postingSignaturesService.createScoped(
      body,
      context,
    );
    return serializeSingle(request, PostingSignatureSerializer, signature);
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PostingSignaturesQueryDto,
    @Param('id') id: string,
  ) {
    const context = this.requireScope(user, query);
    const signature = await this.postingSignaturesService.findOneScoped(
      id,
      context,
    );
    return serializeSingle(request, PostingSignatureSerializer, signature);
  }

  @Patch(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PostingSignaturesQueryDto,
    @Param('id') id: string,
    @Body() body: UpdatePostingSignatureDto,
  ) {
    const context = this.requireScope(user, query);
    const signature = await this.postingSignaturesService.updateScoped(
      id,
      body,
      context,
    );
    return serializeSingle(request, PostingSignatureSerializer, signature);
  }

  @Delete(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @CurrentUser() user: User,
    @Query() query: PostingSignaturesQueryDto,
    @Param('id') id: string,
  ) {
    const context = this.requireScope(user, query);
    await this.postingSignaturesService.removeScoped(id, context);
    return { success: true };
  }

  private requireScope(
    user: User,
    query: PostingSignaturesQueryDto = {},
  ): RequestContext {
    const context = extractRequestContext(user, query);
    if (!context.organizationId || !context.userId) {
      throw new BadRequestException(
        'Organization and user context are required',
      );
    }
    return context;
  }
}
