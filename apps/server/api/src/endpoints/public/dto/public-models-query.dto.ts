import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Query surface for the public model catalog (#2422).
 *
 * Deliberately narrow — `BaseQueryDto` and `ModelsQueryDto` expose
 * `organizationId`, `isDeleted`, and `registryStatus`, which would let an
 * unauthenticated caller probe org-private rows, soft-deleted rows, and
 * unreviewed discovery drafts. The public catalog owns its visibility filter;
 * callers may only narrow it by category and provider.
 */
export class PublicModelsQueryDto {
  @ApiProperty({
    description: 'Filter by model category',
    enum: ModelCategory,
    enumName: 'ModelCategory',
    required: false,
  })
  @IsOptional()
  @IsEnum(ModelCategory)
  category?: ModelCategory;

  @ApiProperty({
    description: 'Filter by inference provider',
    enum: ModelProvider,
    enumName: 'ModelProvider',
    required: false,
  })
  @IsOptional()
  @IsEnum(ModelProvider)
  provider?: ModelProvider;

  @ApiProperty({
    default: 1,
    description: 'Page number for pagination',
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    default: 50,
    description: 'Number of models per page',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
