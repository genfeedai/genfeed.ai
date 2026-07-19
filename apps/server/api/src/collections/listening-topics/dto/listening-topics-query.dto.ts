import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ListeningEvidenceType } from '@genfeedai/enums';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

function transformOptionalBoolean(value: unknown): unknown {
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  return value;
}

export class ListeningTopicsQueryDto extends BaseQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => transformOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}

export class ListeningEvidenceQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({ enum: ListeningEvidenceType })
  @IsOptional()
  @IsEnum(ListeningEvidenceType)
  eventType?: ListeningEvidenceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  source?: string;
}
