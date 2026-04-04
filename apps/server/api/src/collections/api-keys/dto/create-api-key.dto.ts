import { ApiKeyCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNumber,
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
    description: 'Scopes/permissions for this key',
    example: ['videos:create', 'videos:read'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  readonly scopes?: string[];

  @ApiProperty({
    description: 'Expiration date for the key',
    example: '2025-12-31T23:59:59Z',
    required: false,
  })
  @IsOptional()
  @IsDate()
  readonly expiresAt?: Date;

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
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  readonly allowedIps?: string[];
}
