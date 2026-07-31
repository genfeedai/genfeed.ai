import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  CredentialPlatform,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const MAX_RELEASE_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;

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
    const query = args.object as PostGroupsQueryDto;
    if (typeof query.startDate !== 'string' || typeof endDate !== 'string') {
      return true;
    }

    const startTime = Date.parse(query.startDate);
    const endTime = Date.parse(endDate);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return true;
    }

    const duration = endTime - startTime;
    return duration >= 0 && duration <= MAX_RELEASE_WINDOW_MS;
  }

  defaultMessage(): string {
    return 'endDate must be on or after startDate and no more than 366 days later';
  }
}

export class PostGroupsQueryDto {
  @ApiProperty({
    description: 'Inclusive release window start in ISO 8601 format',
    example: '2026-07-20T00:00:00.000Z',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    description: 'Inclusive release window end in ISO 8601 format',
    example: '2026-07-27T00:00:00.000Z',
  })
  @IsDateString()
  @Validate(ReleaseWindowConstraint)
  endDate!: string;

  @ApiProperty({
    description: 'Filter release groups by brand ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brandId?: string;

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
