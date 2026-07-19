import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ListeningEvidenceType } from '@genfeedai/enums';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

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
  @ValidateIf((value) => value.isActive !== undefined)
  @Transform(({ value }) => value === true || value === 'true')
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
