import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiKeysQueryDto } from '@api/collections/api-keys/dto/api-keys-query.dto';
import { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import { UpdateApiKeyDto } from '@api/collections/api-keys/dto/update-api-key.dto';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ApiAccessGuard } from '@api/helpers/guards/api-access/api-access.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import {
  ActionOrigin,
  API_KEY_ACTION_ORIGIN_METADATA_KEY,
  API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY,
  ApiKeyCategory,
} from '@genfeedai/enums';
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
  UseGuards,
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

  private toApiKeyCategory(category: string): ApiKeyCategory {
    const normalized = category.toLowerCase().replaceAll('_', '');
    const match = Object.values(ApiKeyCategory).find(
      (value) => value.replaceAll('_', '') === normalized,
    );

    return match ?? ApiKeyCategory.GENFEEDAI;
  }

  private withoutReservedOriginMetadata(
    metadata: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!metadata) {
      return undefined;
    }
    const {
      [API_KEY_ACTION_ORIGIN_METADATA_KEY]: _actionOrigin,
      [API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY]: _actionOriginProof,
      ...safeMetadata
    } = metadata;
    return safeMetadata;
  }

  private trustedExistingOriginMetadata(
    apiKey: Parameters<ApiKeysService['resolveActionOrigin']>[0],
  ): Record<string, unknown> {
    const origin = this.apiKeysService.resolveActionOrigin(apiKey);
    if (origin !== ActionOrigin.CLI && origin !== ActionOrigin.UI) {
      return {};
    }
    const metadata =
      apiKey.metadata &&
      typeof apiKey.metadata === 'object' &&
      !Array.isArray(apiKey.metadata)
        ? (apiKey.metadata as Record<string, unknown>)
        : {};
    const proof = metadata[API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY];

    return {
      [API_KEY_ACTION_ORIGIN_METADATA_KEY]: origin,
      ...(typeof proof === 'string'
        ? { [API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY]: proof }
        : {}),
    };
  }

  @Post()
  @UseGuards(ApiAccessGuard)
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
      {
        where: {
          isRevoked: false,
          userId: publicMetadata.user,
        },
      },
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
      metadata: this.withoutReservedOriginMetadata(createApiKeyDto.metadata),
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
    @Query() query: ApiKeysQueryDto,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const findAllQuery = {
      orderBy: { createdAt: -1 },
      where: {
        isRevoked: false,
        userId: publicMetadata.user,
        ...(query.label && {
          label: { mode: 'insensitive', contains: query.label },
        }),
        ...(query.description && {
          description: { mode: 'insensitive', contains: query.description },
        }),
        ...(query.search && {
          OR: [
            { label: { mode: 'insensitive', contains: query.search } },
            { description: { mode: 'insensitive', contains: query.search } },
          ],
        }),
      },
    };

    const result = await this.apiKeysService.findAll(findAllQuery, {
      limit: query.limit || 10,
      page: query.page || 1,
    });

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
      throw new NotFoundException({
        message: 'The specified API key was not found.',
      });
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
      throw new NotFoundException({
        message:
          'The specified API key was not found or you do not have permission to modify it.',
      });
    }

    const updatedKey = await this.apiKeysService.patch(apiKeyId, {
      ...updateApiKeyDto,
      ...(updateApiKeyDto.metadata !== undefined
        ? {
            metadata: {
              ...this.withoutReservedOriginMetadata(updateApiKeyDto.metadata),
              ...this.trustedExistingOriginMetadata(existingKey),
            },
          }
        : {}),
    });
    return serializeSingle(request, ApiKeySerializer, updatedKey);
  }

  @Post(':apiKeyId/rotate')
  @UseGuards(ApiAccessGuard)
  @RateLimit({ limit: 5, windowMs: 60000 })
  @ApiOperation({ summary: 'Rotate an API key' })
  @ApiResponse({
    description: 'API key rotated successfully',
    status: HttpStatus.CREATED,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async rotate(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('apiKeyId') apiKeyId: string,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const existingKey = await this.apiKeysService.findOne({
      id: apiKeyId,
      isRevoked: false,
      organizationId: publicMetadata.organization,
      userId: publicMetadata.user,
    });

    if (!existingKey) {
      throw new NotFoundException({
        message:
          'The specified API key was not found or has already been revoked.',
      });
    }

    const existingMetadata =
      existingKey.metadata &&
      typeof existingKey.metadata === 'object' &&
      !Array.isArray(existingKey.metadata)
        ? (existingKey.metadata as Record<string, unknown>)
        : undefined;
    const metadata = this.withoutReservedOriginMetadata(existingMetadata);
    const existingOrigin = this.apiKeysService.resolveActionOrigin(existingKey);
    const trustedOrigin =
      existingOrigin === ActionOrigin.CLI || existingOrigin === ActionOrigin.UI
        ? existingOrigin
        : undefined;

    const replacementInput = {
      allowedIps: existingKey.allowedIps,
      category: this.toApiKeyCategory(existingKey.category),
      description: existingKey.description ?? undefined,
      expiresAt: existingKey.expiresAt?.toISOString(),
      label: existingKey.label,
      metadata,
      organizationId: publicMetadata.organization,
      rateLimit: existingKey.rateLimit ?? undefined,
      scopes: existingKey.scopes,
      userId: publicMetadata.user,
    };
    const { apiKey, plainKey } = trustedOrigin
      ? await this.apiKeysService.rotateWithKey(
          apiKeyId,
          replacementInput,
          trustedOrigin,
        )
      : await this.apiKeysService.rotateWithKey(apiKeyId, replacementInput);

    return serializeSingle(request, ApiKeyFullSerializer, {
      ...apiKey,
      key: plainKey,
    });
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
      throw new NotFoundException({
        message:
          'The specified API key was not found or has already been revoked.',
      });
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
