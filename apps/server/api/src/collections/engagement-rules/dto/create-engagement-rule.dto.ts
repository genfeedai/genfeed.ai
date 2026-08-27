import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  EngagementMetric,
  EngagementRuleAction,
  EngagementRuleMode,
} from '@genfeedai/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateEngagementRuleDto {
  @ApiProperty()
  @IsEntityId()
  postGroupId!: string;

  @ApiProperty()
  @IsEntityId()
  targetId!: string;

  @ApiProperty({ enum: EngagementMetric })
  @IsEnum(EngagementMetric)
  metric!: EngagementMetric;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  threshold!: number;

  @ApiProperty({ enum: EngagementRuleAction })
  @IsEnum(EngagementRuleAction)
  actionType!: EngagementRuleAction;

  @ApiPropertyOptional({ additionalProperties: true, type: 'object' })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  actionPayload?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: EngagementRuleMode })
  @IsOptional()
  @IsEnum(EngagementRuleMode)
  mode?: EngagementRuleMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  windowEndsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
