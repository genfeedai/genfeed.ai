import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  CredentialPlatform,
  PostCategory,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidateIf,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const MAX_RELEASE_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;
const RELEASE_LIST_SORTS = [
  'createdAt: -1',
  'createdAt: 1',
  'scheduledDate: -1',
  'scheduledDate: 1',
  'updatedAt: -1',
  'updatedAt: 1',
] as const;
const PUBLICATION_STATES = ['posted', 'not-posted'] as const;

/**
 * Query strings carry repeated keys (`?status=a&status=b`) for multi-value
 * filters, but a single occurrence arrives as a bare string. Normalize both
 * shapes to an array so `@IsEnum(..., { each: true })` sees a consistent value.
 */
function toFilterArray({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Array.isArray(value) ? value : [value];
}

@ValidatorConstraint({ async: false, name: 'releaseWindow' })
export class ReleaseWindowConstraint implements ValidatorConstraintInterface {
  validate(endDate: unknown, args: ValidationArguments): boolean {
    const { startDate } = args.object as PostGroupsQueryDto;
    const hasStart = typeof startDate === 'string';
    const hasEnd = typeof endDate === 'string';
    if (!hasStart && !hasEnd) {
      return true;
    }
    if (!hasStart || !hasEnd) {
      return false;
    }

    const startTime = Date.parse(startDate);
    const endTime = Date.parse(endDate);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return true;
    }

    const duration = endTime - startTime;
    return duration >= 0 && duration <= MAX_RELEASE_WINDOW_MS;
  }

  defaultMessage(): string {
    return 'startDate and endDate must be supplied together, with endDate on or after startDate and no more than 366 days later';
  }
}

export class PostGroupsQueryDto {
  @ApiProperty({
    description: 'Inclusive release window start in ISO 8601 format',
    example: '2026-07-20T00:00:00.000Z',
    required: false,
  })
  @ValidateIf(
    (query: PostGroupsQueryDto) =>
      query.startDate !== undefined || query.endDate !== undefined,
  )
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'Inclusive release window end in ISO 8601 format',
    example: '2026-07-27T00:00:00.000Z',
    required: false,
  })
  @ValidateIf(
    (query: PostGroupsQueryDto) =>
      query.startDate !== undefined || query.endDate !== undefined,
  )
  @IsDateString()
  @Validate(ReleaseWindowConstraint)
  endDate?: string;

  @ApiProperty({
    description: 'One-based release page for Publish list surfaces',
    minimum: 1,
    required: false,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: 'Release page size for Publish list surfaces',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    description: 'Case-insensitive release title or content search',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Deterministic Publish list ordering',
    enum: RELEASE_LIST_SORTS,
    required: false,
  })
  @IsOptional()
  @IsIn(RELEASE_LIST_SORTS)
  sort?: (typeof RELEASE_LIST_SORTS)[number];

  @ApiProperty({
    description:
      'Release publication facet. Posted means at least one target is published.',
    enum: PUBLICATION_STATES,
    required: false,
  })
  @IsOptional()
  @IsIn(PUBLICATION_STATES)
  publicationState?: (typeof PUBLICATION_STATES)[number];

  @ApiProperty({
    description: 'Filter release groups by brand ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @ApiProperty({
    description: 'Filter release groups to one Publish content campaign',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  campaignId?: string;

  @ApiProperty({
    description:
      'Filter by release status using repeated query keys (for example, ?status=scheduled&status=failed).',
    enum: ReleaseStatus,
    enumName: 'ReleaseStatus',
    isArray: true,
    required: false,
  })
  @Transform(toFilterArray)
  @IsOptional()
  @IsArray()
  @IsEnum(ReleaseStatus, { each: true })
  status?: ReleaseStatus[];

  @ApiProperty({
    description:
      'Filter to releases with at least one channel target on any of these platforms (for example, ?platform=instagram&platform=tiktok).',
    enum: CredentialPlatform,
    enumName: 'CredentialPlatform',
    isArray: true,
    required: false,
  })
  @Transform(toFilterArray)
  @IsOptional()
  @IsArray()
  @IsEnum(CredentialPlatform, { each: true })
  platform?: CredentialPlatform[];

  @ApiProperty({
    description:
      'Filter to releases with at least one channel target publishing through any of these credentials.',
    isArray: true,
    required: false,
  })
  @Transform(toFilterArray)
  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  credentialId?: string[];

  @ApiProperty({
    description:
      'Filter to releases with at least one channel target in any of these execution states. Use `?executionState=failed` for the error-state view.',
    enum: TargetExecutionState,
    enumName: 'TargetExecutionState',
    isArray: true,
    required: false,
  })
  @Transform(toFilterArray)
  @IsOptional()
  @IsArray()
  @IsEnum(TargetExecutionState, { each: true })
  executionState?: TargetExecutionState[];

  @ApiProperty({
    description:
      'Filter to releases with at least one matching target content category.',
    enum: PostCategory,
    enumName: 'PostCategory',
    isArray: true,
    required: false,
  })
  @Transform(toFilterArray)
  @IsOptional()
  @IsArray()
  @IsEnum(PostCategory, { each: true })
  contentType?: PostCategory[];

  @ApiProperty({
    description:
      'Filter to releases with at least one channel target placed by any of these sources. Source is derived from target provenance, not stored.',
    enum: ReleaseTargetSource,
    enumName: 'ReleaseTargetSource',
    isArray: true,
    required: false,
  })
  @Transform(toFilterArray)
  @IsOptional()
  @IsArray()
  @IsEnum(ReleaseTargetSource, { each: true })
  source?: ReleaseTargetSource[];
}
