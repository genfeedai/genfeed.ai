import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ReleaseStatus } from '@genfeedai/enums';
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
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }
    return Array.isArray(value) ? value : [value];
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ReleaseStatus, { each: true })
  status?: ReleaseStatus[];
}
