import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** One connected account per target; matches the schedule panel's reach. */
const MAX_SCHEDULE_TARGETS = 10;

export class BatchProjectScheduleTargetDto {
  @ApiProperty()
  @IsEntityId()
  readonly credentialId!: string;

  @ApiProperty({ description: 'Canonical lowercase platform' })
  @IsString()
  readonly platform!: string;

  @ApiPropertyOptional({ description: 'Omit to publish now' })
  @IsOptional()
  @IsDateString()
  readonly scheduledDate?: string;
}

export class ScheduleBatchProjectDto {
  @ApiProperty({ type: [BatchProjectScheduleTargetDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SCHEDULE_TARGETS)
  @ValidateNested({ each: true })
  @Type(() => BatchProjectScheduleTargetDto)
  readonly targets!: BatchProjectScheduleTargetDto[];

  @ApiPropertyOptional({
    description: 'Caption per item id',
    additionalProperties: true,
    type: Object,
  })
  @IsOptional()
  @IsObject()
  readonly captions?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'IANA timezone the creator scheduled in',
  })
  @IsOptional()
  @IsString()
  readonly timezone?: string;
}
