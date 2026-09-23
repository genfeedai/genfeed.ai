import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import {
  Allow,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Client-writable ingredient fields. Ownership and provenance links stay server-owned.
 * Storage identity (`s3Key`) is written by
 * the server when an upload or generation completes and is deliberately not
 * declared here, so the whitelisting ValidationPipe strips it: a caller must
 * never repoint an ingredient at another object. `cdnUrl` is derived on read.
 */
export class UpdateIngredientDto extends PartialType(
  OmitType(CreateIngredientDto, [
    'organizationId',
    'userId',
    'brandId',
    'metadataId',
    'parentId',
    'promptId',
    'trainingId',
    'bookmarkId',
    'personaId',
    'workflowExecutionId',
    'agentStrategyId',
    'sourceActionId',
    'sources',
    'providerData',
  ] as const),
) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the ingredient is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether this ingredient is marked as favorite',
    required: false,
  })
  readonly isFavorite?: boolean;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Generation progress percentage',
    required: false,
  })
  readonly generationProgress?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Human-readable generation stage',
    required: false,
  })
  readonly generationStage?: string;

  @Allow()
  @IsOptional()
  @ApiProperty({
    description: 'Timestamp when generation completed',
    required: false,
    type: Date,
  })
  readonly generationCompletedAt?: Date;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Generation error message, if any',
    required: false,
  })
  readonly generationError?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Underlying generation source/provider',
    required: false,
  })
  readonly generationSource?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Resolved model key used for generation',
    required: false,
  })
  readonly modelUsed?: string;
}

/**
 * Server-side ingredient update: the client-writable fields plus storage
 * identity, which only completion handlers (uploads, generation, renders)
 * set. Never use this as a request body type.
 */
export type IngredientServerUpdate = Partial<CreateIngredientDto> &
  Partial<UpdateIngredientDto> & {
    readonly s3Key?: string;
  };
