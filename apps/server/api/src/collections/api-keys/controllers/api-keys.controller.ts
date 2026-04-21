import { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import { UpdateApiKeyDto } from '@api/collections/api-keys/dto/update-api-key.dto';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import type { User } from '@clerk/backend';
import { ApiKeyFullSerializer, ApiKeySerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('API Keys')
@Controller('api-keys')
@ApiBearerAuth()
@AutoSwagger()
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @RateLimit({ limit: 5, windowMs: 60000 }) // Limit key creation to 5 per minute
  @ApiOperation({ summary: 'Create a new API key' })
  @ApiResponse({
    description: 'API key created successfully',
    status: HttpStatus.CREATED,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createApiKeyDto: CreateApiKeyDto,
  ) {
    const publicMetadata = getPublicMetadata(user);

    // Check if user has reached API key limit (e.g., 10 keys)
    const existingKeys = await this.apiKeysService.findAll(
      [
        {
          $match: {
            isRevoked: false,
            userId: publicMetadata.user,
          },
        },
      ],
      { limit: 100, page: 1 },
    );

    if (existingKeys.docs.length >= 10) {
      throw new HttpException(
        {
          detail: 'You have reached the maximum number of API keys (10).',
          title: 'API Key Limit Reached',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { apiKey, plainKey } = await this.apiKeysService.createWithKey({
      ...createApiKeyDto,
      organizationId: publicMetadata.organization,
      userId: publicMetadata.user,
    });

    // Add the plain key to the document for serialization (only on creation)
    const apiKeyWithPlainKey = {
      ...apiKey,
      key: plainKey, // This will only be shown once
    };

    return serializeSingle(request, ApiKeyFullSerializer, {
      ...apiKeyWithPlainKey,
      key: plainKey,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys for the current user' })
  @ApiResponse({
    description: 'List of API keys',
    status: HttpStatus.OK,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const queryAny = query as unknown as Record<string, string | undefined>;

    const pipeline = PipelineBuilder.create()
      .match({
        isRevoked: false,
        userId: publicMetadata.user,
        ...(queryAny.label && {
          label: { $options: 'i', $regex: queryAny.label },
        }),
        ...(queryAny.description && {
          description: { $options: 'i', $regex: queryAny.description },
        }),
      })
      .sort({ createdAt: -1 })
      .build();

    const result = await this.apiKeysService.findAll(pipeline, {
      limit: query.limit || 10,
      page: query.page || 1,
    });

    return serializeCollection(request, ApiKeySerializer, result);
  }

  @Get('mcp')
  @ApiOperation({ summary: 'Get MCP-specific API keys' })
  @ApiResponse({
    description: 'List of MCP API keys',
    status: HttpStatus.OK,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findMCPKeys(@Req() request: Request, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);

    const options = {
      limit: 100,
      page: 1,
    };

    // Find keys with MCP in label or description
    const aggregate = PipelineBuilder.create()
      .match({
        $or: [
          { label: { $options: 'i', $regex: 'mcp' } },
          { description: { $options: 'i', $regex: 'mcp' } },
        ],
        isRevoked: false,
        userId: publicMetadata.user,
      })
      .build();

    const result = await this.apiKeysService.findAll(aggregate, options);

    return serializeCollection(request, ApiKeySerializer, result);
  }

  @Get(':apiKeyId')
  @ApiOperation({ summary: 'Get a specific API key' })
  @ApiResponse({
    description: 'API key details',
    status: HttpStatus.OK,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('apiKeyId') apiKeyId: string,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const apiKey = await this.apiKeysService.findOne({
      id: apiKeyId,
      userId: publicMetadata.user,
    });

    if (!apiKey) {
      throw new HttpException(
        {
          detail: 'The specified API key was not found.',
          title: 'API Key Not Found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return serializeSingle(request, ApiKeySerializer, apiKey);
  }

  @Patch(':apiKeyId')
  @ApiOperation({ summary: 'Update an API key' })
  @ApiResponse({
    description: 'API key updated successfully',
    status: HttpStatus.OK,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('apiKeyId') apiKeyId: string,
    @Body() updateApiKeyDto: UpdateApiKeyDto,
  ) {
    const publicMetadata = getPublicMetadata(user);

    // Verify ownership before updating
    const existingKey = await this.apiKeysService.findOne({
      id: apiKeyId,
      userId: publicMetadata.user,
    });

    if (!existingKey) {
      throw new HttpException(
        {
          detail:
            'The specified API key was not found or you do not have permission to modify it.',
          title: 'API Key Not Found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const updatedKey = await this.apiKeysService.patch(
      apiKeyId,
      updateApiKeyDto,
    );
    return serializeSingle(request, ApiKeySerializer, updatedKey);
  }

  @Delete(':apiKeyId')
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({
    description: 'API key revoked successfully',
    status: HttpStatus.OK,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async revoke(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('apiKeyId') apiKeyId: string,
  ) {
    const publicMetadata = getPublicMetadata(user);

    // Verify ownership before revoking
    const existingKey = await this.apiKeysService.findOne({
      id: apiKeyId,
      isRevoked: false,
      userId: publicMetadata.user,
    });

    if (!existingKey) {
      throw new HttpException(
        {
          detail:
            'The specified API key was not found or has already been revoked.',
          title: 'API Key Not Found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const revokedKey = await this.apiKeysService.revoke(apiKeyId);
    return serializeSingle(request, ApiKeySerializer, revokedKey);
  }

  @Post('validate')
  @RateLimit({ limit: 30, windowMs: 60000 }) // 30 requests per minute
  @ApiOperation({ summary: 'Validate an API key (for testing)' })
  @ApiResponse({
    description: 'Validation result',
    status: HttpStatus.OK,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async validate(@Body() body: { key: string }) {
    const apiKey = await this.apiKeysService.findByKey(body.key);

    if (!apiKey) {
      return {
        message: 'Invalid or expired API key',
        valid: false,
      };
    }

    return {
      expiresAt: apiKey.expiresAt,
      label: apiKey.label,
      scopes: apiKey.scopes,
      valid: true,
    };
  }
}
