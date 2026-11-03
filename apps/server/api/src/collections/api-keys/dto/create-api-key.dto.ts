import {
  ApiKeyAllowedIpsField,
  ApiKeyExpiresAtField,
  ApiKeyScopesField,
} from '@api/collections/api-keys/dto/api-key-reach.decorators';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiKeyCategory } from '@genfeedai/contracts';
import { SELF_SERVICE_API_KEY_SCOPES } from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'Label for the API key',
    example: 'MCP Server Key',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly label!: string;

  @ApiProperty({
    description: 'Type of API key',
    enum: ApiKeyCategory,
    enumName: 'ApiKeyCategory',
    example: ApiKeyCategory.GENFEEDAI,
  })
  @IsEnum(ApiKeyCategory)
  readonly category!: ApiKeyCategory;

  @ApiProperty({
    description: 'Description of what this key is used for',
    example: 'Used for ChatGPT MCP integration',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly description?: string;

  @ApiProperty({
    default: ['videos:create', 'videos:read', 'analytics:read'],
    description:
      'Scopes/permissions for this key. Must be a subset of the self-service ' +
      'scope presets; privileged and wildcard ("*") scopes are rejected.',
    enum: SELF_SERVICE_API_KEY_SCOPES,
    example: ['videos:create', 'videos:read'],
    isArray: true,
    required: false,
  })
  @ApiKeyScopesField()
  readonly scopes?: string[];

  @ApiProperty({
    description: 'Expiration date for the key',
    example: '2025-12-31T23:59:59Z',
    required: false,
  })
  @ApiKeyExpiresAtField()
  readonly expiresAt?: string;

  @ApiProperty({
    default: 60,
    description: 'Rate limit (requests per minute)',
    example: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  readonly rateLimit?: number;

  @ApiProperty({
    description: 'IP addresses allowed to use this key',
    example: ['192.168.1.1'],
    required: false,
  })
  @ApiKeyAllowedIpsField()
  readonly allowedIps?: string[];

  @ApiProperty({
    description: 'Optional metadata for managed/system-created keys',
    required: false,
  })
  @IsOptional()
  @IsObject()
  readonly metadata?: Record<string, unknown>;

  @ApiProperty({
    description:
      "Default brand for MCP generation tools when a call omits an explicit brandId. Must belong to this key's organization (#5219).",
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  readonly defaultBrandId?: string;
}
