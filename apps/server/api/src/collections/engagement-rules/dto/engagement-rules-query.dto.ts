import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { EngagementRuleState } from '@genfeedai/enums';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class EngagementRulesQueryDto extends BaseQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  postGroupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  targetId?: string;

  @ApiPropertyOptional({ enum: EngagementRuleState })
  @IsOptional()
  @IsEnum(EngagementRuleState)
  state?: EngagementRuleState;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    return value;
  })
  @IsBoolean()
  isEnabled?: boolean;
}
